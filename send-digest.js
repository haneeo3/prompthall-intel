// Step 4 of the PromptHall Monitor MVP.
// For every site, pulls the latest two scores, compares them, and sends
// one email per site with a plain-language summary + regression flag.
// Usage: npm run send-digest

import "dotenv/config";
import { Resend } from "resend";
import { supabase } from "./supabase-client.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const DIGEST_TO_EMAIL = process.env.DIGEST_TO_EMAIL; // where the email goes for now
const REGRESSION_THRESHOLD = 10; // points dropped week-over-week to count as "broke"

async function getLatestTwoScores(siteId) {
  const { data, error } = await supabase
    .from("scores")
    .select("performance_score, lcp, cls, tbt, checked_at")
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(2);

  if (error) throw new Error(error.message);
  return data; // [latest, previous] or just [latest] if only one check exists
}

function buildSummary(site, latest, previous) {
  const score = latest.performance_score;
  let trendLine = "This is the first check for this site, no comparison yet.";
  let isRegression = false;

  if (previous) {
    const diff = score - previous.performance_score;
    if (diff > 0) {
      trendLine = `Performance improved by ${diff} points since last check.`;
    } else if (diff < 0) {
      trendLine = `Performance dropped by ${Math.abs(diff)} points since last check.`;
      if (Math.abs(diff) >= REGRESSION_THRESHOLD) isRegression = true;
    } else {
      trendLine = "No change in performance score since last check.";
    }
  }

  const bullets = [
    trendLine,
    `Largest Contentful Paint: ${latest.lcp}`,
    `Layout stability (CLS): ${latest.cls}`,
    `Total Blocking Time: ${latest.tbt}`,
  ];

  return { score, bullets, isRegression };
}

function renderEmailHtml(site, summary) {
  const alertBanner = summary.isRegression
    ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
         <strong>⚠️ Something broke this week</strong><br/>
         ${site.url} dropped more than ${REGRESSION_THRESHOLD} points in performance.
       </div>`
    : "";

  const bulletsHtml = summary.bullets
    .map((b) => `<li style="margin-bottom:6px;">${b}</li>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1A6BFF;margin-bottom:4px;">PromptHall Intel</h2>
      <p style="color:#6B7280;margin-top:0;">Weekly report for ${site.url}</p>
      ${alertBanner}
      <div style="font-size:36px;font-weight:bold;color:#111A3C;margin:16px 0;">
        ${summary.score}/100
      </div>
      <ul style="color:#374151;padding-left:20px;">${bulletsHtml}</ul>
      <p style="color:#9CA3AF;font-size:12px;margin-top:32px;">
        You're receiving this because ${site.url} is being monitored on PromptHall.
      </p>
    </div>
  `;
}

async function sendDigestForSite(site) {
  const scores = await getLatestTwoScores(site.id);
  if (scores.length === 0) {
    console.log(`No scores yet for ${site.url}, skipping.`);
    return;
  }

  const [latest, previous] = scores;
  const summary = buildSummary(site, latest, previous);
  const html = renderEmailHtml(site, summary);

  const { error } = await resend.emails.send({
    from: "PromptHall Intel <onboarding@resend.dev>", // swap once a verified domain is set up
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

  const { data: sites, error } = await supabase.from("sites").select("id, url");
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
