// Loops through every row in "sites", runs a PageSpeed check on the
// homepage, and an uptime check on both the homepage and the optional
// contact/checkout page. Saves it all into one "scores" row per site.
// Usage: npm run check-all

import "dotenv/config";
import { supabase } from "./supabase-client.js";

const API_KEY = process.env.PAGESPEED_API_KEY;
const UPTIME_TIMEOUT_MS = 10000;

async function fetchPageSpeed(url) {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("category", "performance");
  if (API_KEY) endpoint.searchParams.set("key", API_KEY);

  const res = await fetch(endpoint.toString());
  if (!res.ok) {
    throw new Error(`PageSpeed API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const lighthouse = data.lighthouseResult;
  const audits = lighthouse.audits;

  return {
    performanceScore: Math.round(lighthouse.categories.performance.score * 100),
    lcp: audits["largest-contentful-paint"].displayValue,
    cls: audits["cumulative-layout-shift"].displayValue,
    tbt: audits["total-blocking-time"].displayValue,
    raw: data,
  };
}

// A plain HTTP check: is this page actually loading with a healthy status code.
// This is intentionally separate from PageSpeed, a page can be "up" but slow,
// or "down" but otherwise well-optimized, they catch different failures.
async function checkUptime(url) {
  if (!url) return { checked: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPTIME_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);
    return { checked: true, status: res.status, ok: res.ok };
  } catch (err) {
    clearTimeout(timeout);
    return { checked: true, status: null, ok: false, error: err.message };
  }
}

async function checkOneSite(site) {
  try {
    console.log(`Checking ${site.url} ...`);

    const [perf, homepageUptime, contactUptime] = await Promise.all([
      fetchPageSpeed(site.url),
      checkUptime(site.url),
      checkUptime(site.contact_url),
    ]);

    const { error: insertError } = await supabase.from("scores").insert({
      site_id: site.id,
      performance_score: perf.performanceScore,
      lcp: perf.lcp,
      cls: perf.cls,
      tbt: perf.tbt,
      raw_json: perf.raw,
      homepage_status: homepageUptime.status ?? null,
      homepage_ok: homepageUptime.ok ?? null,
      contact_status: contactUptime.checked ? contactUptime.status ?? null : null,
      contact_ok: contactUptime.checked ? contactUptime.ok ?? null : null,
    });

    if (insertError) throw new Error(insertError.message);

    const uptimeNote = homepageUptime.ok ? "up" : `DOWN (${homepageUptime.status ?? "no response"})`;
    console.log(`  -> saved. Score: ${perf.performanceScore}/100, homepage: ${uptimeNote}`);
    if (site.contact_url) {
      const contactNote = contactUptime.ok ? "up" : `DOWN (${contactUptime.status ?? "no response"})`;
      console.log(`     contact page: ${contactNote}`);
    }

    return { site: site.url, ok: true };
  } catch (err) {
    console.error(`  -> FAILED: ${err.message}`);
    return { site: site.url, ok: false, error: err.message };
  }
}

async function main() {
  const { data: sites, error } = await supabase.from("sites").select("id, url, contact_url");

  if (error) throw new Error(`Failed to load sites: ${error.message}`);
  if (!sites || sites.length === 0) {
    console.log("No sites to check. Add one with: npm run add-site -- https://example.com");
    return;
  }

  console.log(`Found ${sites.length} site(s) to check.\n`);

  const results = [];
  for (const site of sites) {
    results.push(await checkOneSite(site));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone. ${results.length - failed.length}/${results.length} succeeded.`);
  if (failed.length > 0) {
    console.log("Failed sites:", failed.map((f) => f.site).join(", "));
  }
}

main().catch((err) => {
  console.error("check-all failed:", err.message);
  process.exit(1);
});