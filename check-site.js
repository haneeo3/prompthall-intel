// Step 2 of the PromptHall Monitor MVP.
// Looks up a site by URL in the "sites" table, calls PageSpeed Insights,
// and stores the result as a new row in "scores".
// Usage: npm run check -- https://example.com

import "dotenv/config";
import { supabase } from "./supabase-client.js";

const API_KEY = process.env.PAGESPEED_API_KEY;
const siteUrl = process.argv[2];

if (!siteUrl) {
  console.error("Usage: npm run check -- https://example.com");
  process.exit(1);
}

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

async function findOrWarnSite(url) {
  const { data, error } = await supabase
    .from("sites")
    .select("id, url")
    .eq("url", url)
    .maybeSingle();

  if (error) throw new Error(`Supabase lookup failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `No site found with URL "${url}". Add it first with: npm run add-site -- ${url}`
    );
  }
  return data;
}

async function main() {
  const site = await findOrWarnSite(siteUrl);
  console.log(`Checking ${site.url} ...`);

  const result = await fetchPageSpeed(siteUrl);

  const { error: insertError } = await supabase.from("scores").insert({
    site_id: site.id,
    performance_score: result.performanceScore,
    lcp: result.lcp,
    cls: result.cls,
    tbt: result.tbt,
    raw_json: result.raw,
  });

  if (insertError) {
    throw new Error(`Failed to save score: ${insertError.message}`);
  }

  console.log("\nSaved to Supabase:");
  console.log(`Performance score: ${result.performanceScore}/100`);
  console.log(`LCP: ${result.lcp}  CLS: ${result.cls}  TBT: ${result.tbt}`);
}

main().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});