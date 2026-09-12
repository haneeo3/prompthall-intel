// Sends the weekly email digest for every site.
// Usage: npm run send-digest

import "dotenv/config";
import { Resend } from "resend";
import { supabase } from "./supabase-client.js";
import { getScoreHistory, buildSummary } from "./digest-summary.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const DIGEST_TO_EMAIL = process.env.DIGEST_TO_EMAIL;

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

  const summary = buildSummary(history);
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
  console.log(`Email digest sent for ${site.url}`);
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