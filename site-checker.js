// Core "check one site" logic: PageSpeed performance + full-site crawl.
// Used by both check-all-sites.js (weekly cron) and api/add-site.js
// (instant first check on signup), so they never drift apart.

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

// Runs both checks for one site and returns the row shape ready to insert
// into the "scores" table.
export async function checkSite(url) {
  const [perf, siteReport] = await Promise.all([fetchPageSpeed(url), crawlAndCheckSite(url)]);

  return {
    performance_score: perf.performanceScore,
    lcp: perf.lcp,
    cls: perf.cls,
    tbt: perf.tbt,
    raw_json: perf.raw,
    pages_checked: siteReport.pagesChecked,
    pages_broken_count: siteReport.brokenCount,
    pages_slow_count: siteReport.slowCount,
    pages_report: siteReport.pages,
  };
}
