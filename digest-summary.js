// Shared logic for building a plain-language weekly summary from score
// history, covering every page discovered on the site (not just the
// homepage). Used by send-digest.js.

import { supabase } from "./supabase-client.js";

const REGRESSION_THRESHOLD = 10;
const TREND_WEEKS = 8;

export async function getScoreHistory(siteId) {
  const { data, error } = await supabase
    .from("scores")
    .select(
      "performance_score, lcp, cls, tbt, checked_at, pages_checked, pages_broken_count, pages_slow_count, pages_report"
    )
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(TREND_WEEKS);

  if (error) throw new Error(error.message);
  return data; // newest first
}

// One-line recommendation per broken or slow page.
function pageRecommendation(page) {
  if (!page.ok) {
    if (page.status === 404) {
      return `Broken link or missing page: ${page.url} returns a 404. Fix the link or restore the page.`;
    }
    if (page.status === null) {
      return `${page.url} didn't respond at all (${page.error || "timed out"}). Check hosting or DNS.`;
    }
    return `${page.url} returned an error (status ${page.status}). Worth investigating.`;
  }
  if (page.slow) {
    return `${page.url} took ${(page.responseTimeMs / 1000).toFixed(1)}s to respond. Consider optimizing images, scripts, or server response time on this page.`;
  }
  return null;
}

// A single overall recommendation for the homepage performance metrics,
// separate from the per-page broken/slow findings.
function buildPerformanceRecommendation(latest) {
  const lcpSeconds = parseFloat(latest.lcp);
  const tbtMs = parseFloat(latest.tbt);
  const cls = parseFloat(latest.cls);

  if (!isNaN(lcpSeconds) && lcpSeconds > 2.5) {
    return "Your largest image or block of text is loading slowly. Try compressing images or lazy-loading below-the-fold content.";
  }
  if (!isNaN(tbtMs) && tbtMs > 200) {
    return "Your homepage is slow to respond to clicks after it loads. Consider reducing or deferring non-essential JavaScript.";
  }
  if (!isNaN(cls) && cls > 0.1) {
    return "Elements on your homepage are shifting as it loads. Set fixed sizes for images and ad/embed slots to fix this.";
  }
  return null;
}

function buildTrendLine(history) {
  if (history.length < 3) return null;

  const recent = history.slice(0, 4).map((h) => h.performance_score);
  const isDecliningStreak = recent.every((score, i) => i === 0 || score <= recent[i - 1]);
  const isRisingStreak = recent.every((score, i) => i === 0 || score >= recent[i - 1]);

  if (isDecliningStreak && recent[0] < recent[recent.length - 1]) {
    return `Performance has declined for ${recent.length} checks in a row.`;
  }
  if (isRisingStreak && recent[0] > recent[recent.length - 1]) {
    return `Performance has improved for ${recent.length} checks in a row.`;
  }
  return null;
}

export function buildSummary(history) {
  const [latest, previous] = history;
  const score = latest.performance_score;
  const pagesReport = latest.pages_report || [];
  const brokenPages = pagesReport.filter((p) => !p.ok);
  const slowPages = pagesReport.filter((p) => p.ok && p.slow);

  let weekOverWeekLine = "This is the first check for this site, no comparison yet.";
  let isRegression = brokenPages.length > 0;

  if (previous) {
    const diff = score - previous.performance_score;
    if (diff > 0) {
      weekOverWeekLine = `Performance improved by ${diff} points since last check.`;
    } else if (diff < 0) {
      weekOverWeekLine = `Performance dropped by ${Math.abs(diff)} points since last check.`;
      if (Math.abs(diff) >= REGRESSION_THRESHOLD) isRegression = true;
    } else {
      weekOverWeekLine = "No change in performance score since last check.";
    }
    const prevBrokenCount = previous.pages_broken_count ?? 0;
    if (brokenPages.length > prevBrokenCount) isRegression = true;
  }

  const trendLine = buildTrendLine(history);

  const bullets = [weekOverWeekLine];
  if (trendLine) bullets.push(trendLine);
  bullets.push(`Pages checked: ${latest.pages_checked ?? pagesReport.length}`);
  bullets.push(`Broken pages: ${brokenPages.length}  •  Slow pages: ${slowPages.length}`);
  bullets.push(`Homepage LCP: ${latest.lcp}  •  CLS: ${latest.cls}  •  TBT: ${latest.tbt}`);

  // Build one recommendation per problem page, capped so the email stays readable.
  const pageRecommendations = [...brokenPages, ...slowPages]
    .map(pageRecommendation)
    .filter(Boolean)
    .slice(0, 8);

  const perfRecommendation = buildPerformanceRecommendation(latest);
  const recommendations =
    pageRecommendations.length > 0 || perfRecommendation
      ? [...pageRecommendations, ...(perfRecommendation ? [perfRecommendation] : [])]
      : ["No major issues detected this week, keep an eye on next week's report."];

  return { score, bullets, isRegression, recommendations, brokenPages, slowPages };
}