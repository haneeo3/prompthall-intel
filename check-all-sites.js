// Step 3 of the PromptHall Monitor MVP.
// Loops through every row in "sites" and runs a PageSpeed check for each,
// saving each result into "scores". This is what the weekly automation runs.
// Usage: npm run check-all

import "dotenv/config";
import { supabase } from "./supabase-client.js";

const API_KEY = process.env.PAGESPEED_API_KEY;

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

async function checkOneSite(site) {
  try {
    console.log(`Checking ${site.url} ...`);
    const result = await fetchPageSpeed(site.url);

    const { error: insertError } = await supabase.from("scores").insert({
      site_id: site.id,
      performance_score: result.performanceScore,
      lcp: result.lcp,
      cls: result.cls,
      tbt: result.tbt,
      raw_json: result.raw,
    });

    if (insertError) throw new Error(insertError.message);

    console.log(`  -> saved. Score: ${result.performanceScore}/100`);
    return { site: site.url, ok: true };
  } catch (err) {
    console.error(`  -> FAILED: ${err.message}`);
    return { site: site.url, ok: false, error: err.message };
  }
}

async function main() {
  const { data: sites, error } = await supabase.from("sites").select("id, url");

  if (error) {
    throw new Error(`Failed to load sites: ${error.message}`);
  }
  if (!sites || sites.length === 0) {
    console.log("No sites to check. Add one with: npm run add-site -- https://example.com");
    return;
  }

  console.log(`Found ${sites.length} site(s) to check.\n`);

  // Run sequentially (not in parallel) to stay well under PageSpeed's rate limits.
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