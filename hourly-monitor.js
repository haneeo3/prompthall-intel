// hourly-monitor.js
// Runs every hour via GitHub Actions.
// Checks every site: important pages first (contact, checkout, booking),
// then crawls the homepage for additional linked pages.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { processCheckResults } from "./incident-manager.js";

const TIMEOUT_MS = 10000;
const SLOW_THRESHOLD_MS = 3000;
const MAX_CRAWLED_PAGES = 10;
const CONCURRENCY = 5;

// Validate env vars before doing anything else.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("MISSING ENV VARS:");
  console.error("SUPABASE_URL:", SUPABASE_URL ? "set" : "MISSING");
  console.error("SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_KEY ? "set" : "MISSING");
  process.exit(1);
}

console.log("ENV OK:");
console.log("SUPABASE_URL:", SUPABASE_URL.substring(0, 35) + "...");
console.log("SERVICE_KEY length:", SUPABASE_KEY.length);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Check one URL: is it up, what status, how fast.
async function checkPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    return {
      url,
      ok: res.ok,
      status: res.status,
      responseTimeMs,
      slow: responseTimeMs > SLOW_THRESHOLD_MS,
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      url,
      ok: false,
      status: null,
      responseTimeMs: Date.now() - start,
      slow: false,
      error: err.message,
    };
  }
}

// Discover internal links from the homepage.
async function discoverPages(baseUrl) {
  const pages = new Set();
  try {
    const res = await fetch(baseUrl, { redirect: "follow" });
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
    console.log(`  Could not crawl ${baseUrl}: ${err.message}`);
  }

  return Array.from(pages).slice(0, MAX_CRAWLED_PAGES);
}

// Check a batch of URLs in parallel with a concurrency cap.
async function checkBatch(urls) {
  const results = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(checkPage));
    results.push(...batchResults);
  }
  return results;
}

async function checkOneSite(site) {
  const label = site.name || site.url;
  console.log(`\nChecking: ${label}`);

  try {
    const importantPages = Array.isArray(site.important_pages)
      ? site.important_pages.filter(Boolean)
      : [];

    const crawledPages = await discoverPages(site.url);
    const allUrls = [...new Set([site.url, ...importantPages, ...crawledPages])];
    const results = await checkBatch(allUrls);

    const broken = results.filter((r) => !r.ok);
    const slow = results.filter((r) => r.ok && r.slow);
    console.log(`  pages: ${results.length} checked, ${broken.length} broken, ${slow.length} slow`);

    const { error: insertError } = await supabase.from("uptime_checks").insert({
      site_id: site.id,
      checked_at: new Date().toISOString(),
      pages_checked: results.length,
      pages_broken: broken.length,
      pages_slow: slow.length,
      homepage_ok: results.find((r) => r.url === site.url)?.ok ?? false,
      homepage_response_ms: results.find((r) => r.url === site.url)?.responseTimeMs ?? null,
      results_json: results,
    });

    if (insertError) {
      console.error(`  Failed to save uptime record: ${insertError.message}`);
    } else {
      console.log(`  Saved uptime record`);
    }

    await processCheckResults(site, results);

  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
  }
}

async function main() {
  console.log(`\n[${new Date().toISOString()}] Hourly monitor starting`);

  console.log("\nTesting Supabase connection...");
  const { data: testData, error: testError } = await supabase
    .from("sites")
    .select("id")
    .limit(1);

  if (testError) {
    console.error("Supabase connection failed:", testError.message);
    console.error("Code:", testError.code);
    process.exit(1);
  }

  console.log("Supabase connection OK");

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, url, name, owner_email, important_pages");

  if (error) {
    console.error("Failed to load sites:", error.message);
    process.exit(1);
  }

  if (!sites || sites.length === 0) {
    console.log("No sites registered yet.");
    return;
  }

  console.log(`Sites to check: ${sites.length}`);

  for (const site of sites) {
    await checkOneSite(site);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Monitor crashed:", err.message);
  console.error(err.stack);
  process.exit(1);
});