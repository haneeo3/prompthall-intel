// uptime-monitor.js
// Runs every 5 minutes via GitHub Actions (npm run monitor).
// Checks every site: homepage, important pages (contact, checkout, booking),
// then up to MAX_CRAWLED_PAGES linked from the homepage.
//
// Reliability rules:
// - A page is only reported "down" if it fails two checks 30 seconds apart,
//   so a one-off hiccup never emails the owner.
// - A page with an open incident is only reported "recovered" if it passes
//   two checks 30 seconds apart, so a flaky page never gets a premature
//   "resolved" email.
// - Sites are checked a few at a time so one slow site can't delay the rest.
// - If HEARTBEAT_URL is set (e.g. a Healthchecks.io check), the run pings it
//   on start, success and failure, so YOU get alerted if the monitor itself
//   stops running.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { processCheckResults } from "./incident-manager.js";

const TIMEOUT_MS = 10000;
const SLOW_THRESHOLD_MS = 3000;
const MAX_CRAWLED_PAGES = 10;
const PAGE_CONCURRENCY = 5; // pages checked at once, per site
const SITE_CONCURRENCY = 8; // sites checked at once (I/O-bound, so this can be fairly high)
const RECHECK_DELAY_MS = 30000; // wait before the confirming second check
const HEARTBEAT_URL = process.env.HEARTBEAT_URL;

// Validate env vars before doing anything else.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("MISSING ENV VARS:");
  console.error("SUPABASE_URL:", SUPABASE_URL ? "set" : "MISSING");
  console.error("SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_KEY ? "set" : "MISSING");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ping the dead-man's switch. suffix is "", "/start" or "/fail".
async function heartbeat(suffix = "") {
  if (!HEARTBEAT_URL) return;
  try {
    await fetch(HEARTBEAT_URL + suffix, { method: "POST", signal: AbortSignal.timeout(5000) });
  } catch (err) {
    console.error(`Heartbeat ping failed (${suffix || "success"}): ${err.message}`);
  }
}

// Turn a fetch failure into a short machine-readable category.
function classifyError(err) {
  if (err.name === "AbortError" || err.name === "TimeoutError") return "timeout";
  const code = err.cause?.code || "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ECONNREFUSED") return "connection_refused";
  if (code === "ECONNRESET") return "connection_reset";
  if (code.startsWith("ERR_TLS") || code.startsWith("CERT_") || code.includes("CERTIFICATE") || code.includes("SELF_SIGNED")) return "tls";
  return "network";
}

// First ~300 printable characters of an error page, tags removed. Gives a
// developer the actual error text (e.g. "502 Bad Gateway", a WordPress
// "Error establishing a database connection") without us storing whole pages.
async function readBodySnippet(res) {
  try {
    const text = await res.text();
    return text
      .replace(/<[^>]+>/g, " ")
      .replace(/[^ -~]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, 300);
  } catch {
    return undefined;
  }
}

// Check one URL: is it up, what status, how fast. On failure, capture what a
// developer would need: error category, server header, body snippet.
async function checkPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    const result = {
      url,
      ok: res.ok,
      status: res.status,
      responseTimeMs,
      slow: responseTimeMs > SLOW_THRESHOLD_MS,
      checkedAt,
      finalUrl: res.url && res.url !== url ? res.url : undefined,
    };
    if (!res.ok) {
      result.errorType = res.status >= 500 ? "http_5xx" : res.status >= 400 ? "http_4xx" : "http_other";
      result.server = res.headers.get("server") || undefined;
      result.contentType = res.headers.get("content-type") || undefined;
      result.bodySnippet = await readBodySnippet(res);
    }
    return result;
  } catch (err) {
    clearTimeout(timeout);
    return {
      url,
      ok: false,
      status: null,
      responseTimeMs: Date.now() - start,
      slow: false,
      checkedAt,
      error: err.cause?.message || err.message,
      errorCode: err.cause?.code,
      errorType: classifyError(err),
    };
  }
}

// Discover internal links from the homepage.
async function discoverPages(baseUrl, label) {
  const pages = new Set();
  try {
    const res = await fetch(baseUrl, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const html = await res.text();
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;
      try {
        const absolute = new URL(href, baseUrl).toString();
        if (new URL(absolute).hostname === base.hostname) {
          pages.add(absolute.split("#")[0]);
        }
      } catch {}
    });
  } catch (err) {
    console.log(`[${label}] could not crawl homepage: ${err.message}`);
  }

  return Array.from(pages).slice(0, MAX_CRAWLED_PAGES);
}

// Check a batch of URLs in parallel with a concurrency cap.
async function checkBatch(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += PAGE_CONCURRENCY) {
    const batch = urls.slice(i, i + PAGE_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkPage));
    results.push(...batchResults);
  }
  return results;
}

// URLs that currently have an open incident for this site.
async function getOpenIncidentUrls(siteId, label) {
  const { data, error } = await supabase
    .from("incidents")
    .select("page_url")
    .eq("site_id", siteId)
    .is("resolved_at", null);

  if (error) {
    console.error(`[${label}] could not load open incidents: ${error.message}`);
    return new Set();
  }
  return new Set((data || []).map((row) => row.page_url));
}

// Second check for any page whose state would open or close an incident.
// Both checks must agree before we change state; a mixed result is treated
// as "flaky" and leaves the current state alone.
async function confirmResults(results, openIncidentUrls, label) {
  const needsRecheck = results.filter((r) => !r.ok || openIncidentUrls.has(r.url));
  if (needsRecheck.length === 0) return results;

  console.log(`[${label}] re-checking ${needsRecheck.length} page(s) in ${RECHECK_DELAY_MS / 1000}s to confirm`);
  await sleep(RECHECK_DELAY_MS);

  const rechecked = await checkBatch(needsRecheck.map((r) => r.url));
  const secondByUrl = new Map(rechecked.map((r) => [r.url, r]));

  return results.map((first) => {
    const second = secondByUrl.get(first.url);
    if (!second) return first;

    if (!first.ok && !second.ok) return { ...second, confirmed: true }; // really down
    if (first.ok && second.ok) return second; // really up

    // Mixed: keep the current state. If an incident is open, keep it open
    // (report the failing check); otherwise don't open one (report the pass).
    const hasOpenIncident = openIncidentUrls.has(first.url);
    const failing = first.ok ? second : first;
    const passing = first.ok ? first : second;
    console.log(`[${label}] flaky: ${first.url} (${hasOpenIncident ? "keeping incident open" : "not alerting"})`);
    return { ...(hasOpenIncident ? failing : passing), flaky: true };
  });
}

async function checkOneSite(site) {
  const label = site.name || site.url;
  console.log(`[${label}] checking`);

  try {
    const importantPages = Array.isArray(site.important_pages)
      ? site.important_pages.filter(Boolean)
      : [];

    const [crawledPages, openIncidentUrls] = await Promise.all([
      discoverPages(site.url, label),
      getOpenIncidentUrls(site.id, label),
    ]);

    const allUrls = [...new Set([site.url, ...importantPages, ...crawledPages])];
    const firstPass = await checkBatch(allUrls);
    const results = await confirmResults(firstPass, openIncidentUrls, label);

    const broken = results.filter((r) => !r.ok);
    const slow = results.filter((r) => r.ok && r.slow);
    console.log(`[${label}] pages: ${results.length} checked, ${broken.length} broken, ${slow.length} slow`);

    const homepage = results.find((r) => r.url === site.url);
    const { error: insertError } = await supabase.from("uptime_checks").insert({
      site_id: site.id,
      checked_at: new Date().toISOString(),
      pages_checked: results.length,
      pages_broken: broken.length,
      pages_slow: slow.length,
      homepage_ok: homepage?.ok ?? false,
      homepage_response_ms: homepage?.responseTimeMs ?? null,
      results_json: results,
    });

    if (insertError) {
      console.error(`[${label}] failed to save uptime record: ${insertError.message}`);
    }

    await processCheckResults(site, results);
    return { ok: true };
  } catch (err) {
    console.error(`[${label}] FAILED: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// Run fn over items, at most `limit` at a time.
async function runWithConcurrency(items, limit, fn) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Uptime monitor starting`);
  await heartbeat("/start");

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, url, name, owner_email, important_pages");

  if (error) {
    throw new Error(`Failed to load sites: ${error.message} (code ${error.code})`);
  }

  if (!sites || sites.length === 0) {
    console.log("No sites registered yet.");
    await heartbeat();
    return;
  }

  console.log(`Sites to check: ${sites.length}`);

  const outcomes = await runWithConcurrency(sites, SITE_CONCURRENCY, checkOneSite);
  const failed = outcomes.filter((o) => !o.ok).length;

  console.log(`Done. ${sites.length - failed}/${sites.length} sites checked successfully.`);

  if (failed === sites.length) {
    // Every site errored out: almost certainly a problem on our side
    // (network, Supabase, bad deploy), not theirs. Treat the run as failed.
    throw new Error("Every site check failed");
  }

  await heartbeat();
}

main().catch(async (err) => {
  console.error("Monitor crashed:", err.message);
  console.error(err.stack);
  await heartbeat("/fail");
  process.exit(1);
});
