// Discovers internal pages linked from a site's homepage, then checks each
// one for status (404/broken), and speed (slow response). This replaces the
// old "just check homepage + one contact page" approach with a fuller
// picture of the whole site.

import * as cheerio from "cheerio";

const MAX_PAGES = 20; // cap to keep run time and API usage reasonable
const PAGE_TIMEOUT_MS = 10000;
const SLOW_THRESHOLD_MS = 3000; // a page taking longer than this counts as "slow"

function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isSameSite(url, baseUrl) {
  try {
    return new URL(url).hostname === new URL(baseUrl).hostname;
  } catch {
    return false;
  }
}

function stripFragment(url) {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
}

// Fetches the homepage HTML and pulls out same-site links.
async function discoverPages(baseUrl) {
  const pages = new Set([stripFragment(baseUrl)]);

  try {
    const res = await fetch(baseUrl, { redirect: "follow" });
    const html = await res.text();
    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) {
        return;
      }
      const absolute = toAbsoluteUrl(href, baseUrl);
      if (absolute && isSameSite(absolute, baseUrl)) {
        pages.add(stripFragment(absolute));
      }
    });
  } catch (err) {
    // If we can't even load the homepage, discovery just returns the homepage
    // itself, the uptime check on it will surface the real error.
  }

  return Array.from(pages).slice(0, MAX_PAGES);
}

// Checks one page: status code, whether it's ok, and how long it took.
async function checkPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const responseTimeMs = Date.now() - start;
    clearTimeout(timeout);
    return {
      url,
      status: res.status,
      ok: res.ok,
      responseTimeMs,
      slow: responseTimeMs > SLOW_THRESHOLD_MS,
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      url,
      status: null,
      ok: false,
      responseTimeMs: Date.now() - start,
      slow: false,
      error: err.message,
    };
  }
}

// Main entry point: discover pages, check each one, return a full report.
// Pages are checked in parallel batches instead of one at a time, checking
// 20 pages sequentially (each up to 10s) could take 3+ minutes worst case,
// which blows past serverless function time limits. Batches keep this fast
// without hammering the target site with 20 simultaneous requests.
const CONCURRENCY = 5;

export async function crawlAndCheckSite(baseUrl) {
  const pageUrls = await discoverPages(baseUrl);

  const results = [];
  for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
    const batch = pageUrls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((url) => checkPage(url)));
    results.push(...batchResults);
  }

  const broken = results.filter((p) => !p.ok);
  const slow = results.filter((p) => p.ok && p.slow);

  return {
    pagesChecked: results.length,
    pages: results,
    brokenCount: broken.length,
    slowCount: slow.length,
    broken,
    slow,
  };
}