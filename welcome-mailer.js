// welcome-mailer.js
// The first email a new site owner gets, before the first report: what the
// free pilot is, when they will hear from us, how to request a fix, how to stop.

import { Resend } from "resend";
import { APP_URL, FROM, esc, fixMailto, cancelUrl, emailFooterHtml } from "./links.js";

export function renderWelcomeHtml(site) {
  const name = site.name || site.url;
  const P = 'style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;"';
  return `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#ffffff;">
      <div style="margin-bottom:24px;"><span style="font-size:13px;font-weight:600;color:#7C5CFF;letter-spacing:1px;">PROMPTHALL.SPACE</span></div>

      <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">Welcome to the free pilot</p>
      <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">We're now watching ${esc(name)}.</h2>

      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
        You're using PromptHall <strong>free of charge</strong> during our pilot. No card, no contract.
        In return we only ask that you tell us when an email was useful, confusing or late.
      </p>

      <div style="background:#F8FAFC;border-radius:8px;padding:16px;margin:0 0 20px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;">What happens from here</p>
        <p ${P}><strong>In about a minute</strong> — your first report arrives in a separate email.</p>
        <p ${P}><strong>Every 5 minutes</strong> — we check your site. If a page breaks, you get one email within minutes; another when it's fixed.</p>
        <p ${P}><strong>Every Monday, 8am</strong> — a report of the week. Otherwise, silence.</p>
      </div>

      <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:16px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827;">If something breaks and you need it fixed</p>
        <p ${P}>
          Every alert has a <strong>"For your developer"</strong> section — forward it and they can start.
          No developer? <a href="${fixMailto(site)}" style="color:#7C5CFF;">Request a fix</a> or just reply to any of our emails.
          We'll connect you to one of ours; you get a quote before any work starts.
        </p>
      </div>

      <p ${P}>Everything about the pilot, on one page: <a href="${APP_URL}/welcome.html" style="color:#7C5CFF;">${esc(APP_URL.replace(/^https?:[/][/]/, ""))}/welcome.html</a></p>
      <p ${P}>Changed your mind? <a href="${cancelUrl(site)}" style="color:#6B7280;">Stop monitoring this site</a> — one click, no questions.</p>
      ${emailFooterHtml(site)}
    </div>`;
}

export async function sendWelcomeEmail(site) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM,
    to: site.owner_email,
    subject: `Welcome to PromptHall — we're now watching ${site.name || site.url}`,
    html: renderWelcomeHtml(site),
  });
  if (error) console.error(`Failed to send welcome email for ${site.url}:`, error.message || error);
  return !error;
}
