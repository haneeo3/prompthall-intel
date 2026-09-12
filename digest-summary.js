// Shared logic for building a plain-language weekly summary from score
// history. Used by both send-digest.js (email) and send-whatsapp-digest.js
// so the two channels never drift out of sync with each other.

import { supabase } from "./supabase-client.js";

const REGRESSION_THRESHOLD = 10;
const TREND_WEEKS = 8;

export async function getScoreHistory(siteId) {
  const { data, error } = await supabase
    .from("scores")
    .select(
      "performance_score, lcp, cls, tbt, checked_at, homepage_ok, homepage_status, contact_ok, contact_status"
    )
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(TREND_WEEKS);

  if (error) throw new Error(error.message);
  return data; // newest first
}

function buildRecommendation(latest) {
  const lcpSeconds = parseFloat(latest.lcp);
  const tbtMs = parseFloat(latest.tbt);
  const cls = parseFloat(latest.cls);

  if (!latest.homepage_ok) {
    return "Your homepage isn't loading properly. This is urgent, check your hosting or recent deploys first.";
  }
  if (!latest.contact_ok && latest.contact_status !== null) {
    return "Your contact/checkout page isn't loading. Visitors trying to reach you may be hitting an error.";
  }
  if (!isNaN(lcpSeconds) && lcpSeconds > 2.5) {
    return "Your largest image or block of text is loading slowly. Try compressing images or lazy-loading below-the-fold content.";
  }
  if (!isNaN(tbtMs) && tbtMs > 200) {
    return "Your page is slow to respond to clicks after it loads. Consider reducing or deferring non-essential JavaScript.";
  }
  if (!isNaN(cls) && cls > 0.1) {
    return "Elements on your page are shifting as it loads. Set fixed sizes for images and ad/embed slots to fix this.";
  }
  return "No major issues detected this week, keep an eye on next week's report.";
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
  let weekOverWeekLine = "This is the first check for this site, no comparison yet.";
  let isRegression = !latest.homepage_ok || (latest.contact_status !== null && !latest.contact_ok);

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
  }

  const trendLine = buildTrendLine(history);
  const recommendation = buildRecommendation(latest);

  const bullets = [weekOverWeekLine];
  if (trendLine) bullets.push(trendLine);
  bullets.push(
    `Homepage: ${latest.homepage_ok ? "up" : `down (status ${latest.homepage_status ?? "no response"})`}`
  );
  if (latest.contact_status !== null) {
    bullets.push(
      `Contact page: ${latest.contact_ok ? "up" : `down (status ${latest.contact_status ?? "no response"})`}`
    );
  }
  bullets.push(`LCP: ${latest.lcp}  •  CLS: ${latest.cls}  •  TBT: ${latest.tbt}`);

  return { score, bullets, isRegression, recommendation };
}
