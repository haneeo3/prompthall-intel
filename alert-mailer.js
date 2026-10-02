// alert-mailer.js
// Sends plain-language alert emails to business owners.
// No technical jargon. Business owners should understand every word.

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "PromptHall <monitor@prompthall.space>";

export async function sendIssueAlert(site, page, description, recommendation) {
  const subject = `Issue detected on ${site.name || site.url}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#ffffff;">
      <div style="margin-bottom:24px;">
        <span style="font-size:13px;font-weight:600;color:#6366F1;letter-spacing:1px;">PROMPTHALL.SPACE</span>
      </div>

      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#991B1B;">🔴 Issue detected</p>
        <p style="margin:6px 0 0;font-size:14px;color:#7F1D1D;">${site.name || site.url}</p>
      </div>

      <p style="font-size:16px;color:#111827;font-weight:600;margin:0 0 8px;">${description}</p>

      <p style="font-size:14px;color:#374151;margin:0 0 24px;">
        This was detected on: <strong>${page.url}</strong>
      </p>

      <div style="background:#F8FAFC;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827;">What to do</p>
        <p style="margin:0;font-size:14px;color:#374151;">${recommendation}</p>
      </div>

      <p style="font-size:14px;color:#374151;">
        PromptHall is continuing to monitor your website and will notify you when this is resolved.
      </p>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
      <p style="font-size:12px;color:#9CA3AF;margin:0;">
        PromptHall.space &nbsp;|&nbsp; Your website. Our watch.<br/>
        Monitoring: ${site.url}
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: FROM,
    to: site.owner_email,
    subject,
    html,
  });

  if (error) {
    console.error(`Failed to send issue alert for ${site.url}:`, error.message || error);
  } else {
    console.log(`  [alert] issue email sent to ${site.owner_email}`);
  }
}

export async function sendRecoveryAlert(site, page, durationText) {
  const subject = `Issue resolved on ${site.name || site.url}`;
  const pageName = friendlyPageName(page.url);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#ffffff;">
      <div style="margin-bottom:24px;">
        <span style="font-size:13px;font-weight:600;color:#6366F1;letter-spacing:1px;">PROMPTHALL.SPACE</span>
      </div>

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#166534;">🟢 Issue resolved</p>
        <p style="margin:6px 0 0;font-size:14px;color:#14532D;">${site.name || site.url}</p>
      </div>

      <p style="font-size:16px;color:#111827;font-weight:600;margin:0 0 8px;">
        Your ${pageName} is working normally again.
      </p>

      <p style="font-size:14px;color:#374151;margin:0 0 24px;">
        PromptHall confirmed the page is responding correctly.
        The issue lasted <strong>${durationText}</strong>.
      </p>

      <p style="font-size:14px;color:#374151;">
        No further action is needed. PromptHall will continue monitoring your website.
      </p>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
      <p style="font-size:12px;color:#9CA3AF;margin:0;">
        PromptHall.space &nbsp;|&nbsp; Your website. Our watch.<br/>
        Monitoring: ${site.url}
      </p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: FROM,
    to: site.owner_email,
    subject,
    html,
  });

  if (error) {
    console.error(`Failed to send recovery alert for ${site.url}:`, error.message || error);
  } else {
    console.log(`  [alert] recovery email sent to ${site.owner_email}`);
  }
}

function friendlyPageName(url) {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "homepage";
    const segment = path.replace(/\/$/, "").split("/").pop();
    return `${segment} page`;
  } catch {
    return "page";
  }
}