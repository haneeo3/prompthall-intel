// For every site, pulls recent score history, compares latest to previous,
// checks the multi-week trend, and sends one email per site with a
// plain-language summary, uptime status, regression flag, and a basic
// recommendation. Usage: npm run send-digest

import "dotenv/config";
import { Resend } from "resend";
import { supabase } from "./supabase-client.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const DIGEST_TO_EMAIL = process.env.DIGEST_TO_EMAIL;
const REGRESSION_THRESHOLD = 10;
const TREND_WEEKS = 8;

async function getScoreHistory(siteId) {
  const { data, error } = await supabase
    .from("scores")
    .select("performance_score, lcp, cls, tbt, checked_at, homepage_ok, homepage_status, contact_ok, contact_status")
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(TREND_WEEKS);

  if (error) throw new Error(error.message);
  return data; // newest first
}

// Very small rules-based recommendation, no AI needed for this yet.
// Looks at whichever metric is worst and gives one plain-language tip.
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

function buildSummary(site, history) {
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
  bullets.push(`Homepage: ${latest.homepage_ok ? "up" : `down (status ${latest.homepage_status ?? "no response"})`}`);
  if (latest.contact_status !== null) {
    bullets.push(`Contact page: ${latest.contact_ok ? "up" : `down (status ${latest.contact_status ?? "no response"})`}`);
  }
  bullets.push(`LCP: ${latest.lcp}  •  CLS: ${latest.cls}  •  TBT: ${latest.tbt}`);

  return { score, bullets, isRegression, recommendation };
}

function renderEmailHtml(site, summary) {
  const alertBanner = summary.isRegression
    ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
         <strong>⚠️ Something broke this week</strong><br/>
         ${site.url} needs attention, see details below.
       </div>`
    : "";

  const bulletsHtml = summary.bullets.map((b) => `<li style="margin-bottom:6px;">${b}</li>`).join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1A6BFF;margin-bottom:4px;">PromptHall Monitor</h2>
      <p style="color:#6B7280;margin-top:0;">Weekly report for ${site.url}</p>
      ${alertBanner}
      <div style="font-size:36px;font-weight:bold;color:#111A3C;margin:16px 0;">
        ${summary.score}/100
      </div>
      <ul style="color:#374151;padding-left:20px;">${bulletsHtml}</ul>
      <div style="background:#F5F7FC;border-radius:8px;padding:14px 16px;margin-top:16px;">
        <strong style="color:#111A3C;">Recommendation:</strong>
        <span style="color:#374151;"> ${summary.recommendation}</span>
      </div>
      <p style="color:#9CA3AF;font-size:12px;margin-top:32px;">
        You're receiving this because ${site.url} is being monitored on PromptHall.
      </p>
    </div>
  `;
}

async function sendDigestForSite(site) {
  const history = await getScoreHistory(site.id);
  if (history.length === 0) {
    console.log(`No scores yet for ${site.url}, skipping.`);
    return;
  }

  const summary = buildSummary(site, history);
  const html = renderEmailHtml(site, summary);

  const { error } = await resend.emails.send({
    from: "PromptHall Monitor <onboarding@resend.dev>",
    to: DIGEST_TO_EMAIL,
    subject: summary.isRegression
      ? `⚠️ ${site.url} — something broke this week`
      : `${site.url} — weekly report (${summary.score}/100)`,
    html,
  });

  if (error) {
    console.error(`Failed to send digest for ${site.url}:`, error.message || error);
    return;
  }
  console.log(`Digest sent for ${site.url}`);
}

async function main() {
  if (!process.env.RESEND_API_KEY || !DIGEST_TO_EMAIL) {
    throw new Error("Missing RESEND_API_KEY or DIGEST_TO_EMAIL in .env");
  }

  const { data: sites, error } = await supabase.from("sites").select("id, url, contact_url");
  if (error) throw new Error(`Failed to load sites: ${error.message}`);
  if (!sites || sites.length === 0) {
    console.log("No sites to report on.");
    return;
  }

  for (const site of sites) {
    await sendDigestForSite(site);
  }
}

main().catch((err) => {
  console.error("send-digest failed:", err.message);
  process.exit(1);
});