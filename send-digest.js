// Sends the weekly email digest for every site, to that site's own owner.
// Falls back to DIGEST_TO_EMAIL for sites added without an owner_email.
// Usage: npm run send-digest

import "dotenv/config";
import { Resend } from "resend";
import { supabase } from "./supabase-client.js";
import { getScoreHistory, buildSummary } from "./digest-summary.js";
import { renderEmailHtml } from "./email-template.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FALLBACK_EMAIL = process.env.DIGEST_TO_EMAIL;

async function sendDigestForSite(site) {
  const recipient = site.owner_email || FALLBACK_EMAIL;
  if (!recipient) {
    console.log(`No owner_email set for ${site.url} and no fallback configured, skipping.`);
    return;
  }

  const history = await getScoreHistory(site.id);
  if (history.length === 0) {
    console.log(`No scores yet for ${site.url}, skipping.`);
    return;
  }

  const summary = buildSummary(history);
  const html = renderEmailHtml(site, summary);

  const { error } = await resend.emails.send({
    from: "PromptHall Monitor <monitor@prompthall.space>",
    to: recipient,
    subject: summary.isRegression
      ? `⚠️ ${site.url} — something broke this week`
      : `${site.url} — weekly report (${summary.score}/100)`,
    html,
  });

  if (error) {
    console.error(`Failed to send digest for ${site.url}:`, error.message || error);
    return;
  }
  console.log(`Email digest sent for ${site.url} -> ${recipient}`);
}

async function main() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY in .env");
  }

  const { data: sites, error } = await supabase.from("sites").select("id, url, owner_email");
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