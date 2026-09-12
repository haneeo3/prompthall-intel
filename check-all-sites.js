// Loops through every row in "sites", runs a PageSpeed check on the
// homepage, and crawls + checks every discoverable page on the site
// (up to a cap) for broken links and slow pages. Saves it all into one
// "scores" row per site. Usage: npm run check-all

import "dotenv/config";
import { supabase } from "./supabase-client.js";
import { crawlAndCheckSite } from "./site-crawler.js";

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

    const [perf, siteReport] = await Promise.all([
      fetchPageSpeed(site.url),
      crawlAndCheckSite(site.url),
    ]);

    const { error: insertError } = await supabase.from("scores").insert({
      site_id: site.id,
      performance_score: perf.performanceScore,
      lcp: perf.lcp,
      cls: perf.cls,
      tbt: perf.tbt,
      raw_json: perf.raw,
      pages_checked: siteReport.pagesChecked,
      pages_broken_count: siteReport.brokenCount,
      pages_slow_count: siteReport.slowCount,
      pages_report: siteReport.pages,
    });

    if (insertError) throw new Error(insertError.message);

    console.log(
      `  -> saved. Score: ${perf.performanceScore}/100, pages checked: ${siteReport.pagesChecked}, broken: ${siteReport.brokenCount}, slow: ${siteReport.slowCount}`
    );
    if (siteReport.broken.length > 0) {
      siteReport.broken.forEach((p) => console.log(`     BROKEN: ${p.url} (status ${p.status ?? "no response"})`));
    }
    if (siteReport.slow.length > 0) {
      siteReport.slow.forEach((p) => console.log(`     SLOW: ${p.url} (${p.responseTimeMs}ms)`));
    }

    return { site: site.url, ok: true };
  } catch (err) {
    console.error(`  -> FAILED: ${err.message}`);
    return { site: site.url, ok: false, error: err.message };
  }
}

async function main() {
  const { data: sites, error } = await supabase.from("sites").select("id, url");

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