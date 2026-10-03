// alert-mailer.js
// Sends alert emails to business owners. The top of every email is plain
// language with no jargon and says how the problem affects their business.
// A "For your developer" section at the bottom carries the technical facts,
// so the owner can forward the email as-is and the developer can act on it.

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "PromptHall <monitor@prompthall.space>";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pathOf(url) {
  try {
    return new URL(url).pathname.toLowerCase() || "/";
  } catch {
    return "/";
  }
}

function friendlyPageName(url) {
  const path = pathOf(url);
  if (path === "/" || path === "") return "homepage";
  const segment = path.replace(/[/]+$/, "").split("/").pop();
  return `${segment} page`;
}

// Plain-English business impact, based on what the page is for.
function businessImpact(page) {
  const path = pathOf(page.url);
  if (path === "/") return "Your whole website is unreachable, so every visitor is affected.";
  if (/checkout|cart|pay|order|shop|buy/.test(path)) return "Customers cannot complete purchases on this page right now, so you may be losing sales.";
  if (/book|appoint|reserv|schedule/.test(path)) return "Customers cannot make bookings on this page right now and may go elsewhere.";
  if (/contact|quote|enquir|inquir/.test(path)) return "Customers cannot reach you through this page right now.";
  return "Visitors who open this page are seeing an error instead of your content.";
}

// What a developer should suspect and where to look, by error type.
function developerNotes(page) {
  switch (page.errorType) {
    case "dns":
      return {
        cause: "The domain name is not resolving. Common reasons: expired domain, nameserver change, or a deleted DNS record.",
        lookAt: "Domain registrar (is the domain still active and paid?), DNS records at the DNS provider, any DNS changes in the last 48 hours.",
      };
    case "tls":
      return {
        cause: "The HTTPS certificate is invalid, expired, or does not match this hostname.",
        lookAt: "Certificate expiry date and auto-renewal (Let's Encrypt, Cloudflare, or the hosting panel).",
      };
    case "connection_refused":
      return {
        cause: "The server is reachable but nothing is listening on the web port. The web server or app process is probably down.",
        lookAt: "Is the web server / app process running? Firewall or port changes? Hosting account suspended or out of credit?",
      };
    case "connection_reset":
      return {
        cause: "The server dropped the connection mid-request.",
        lookAt: "Web server and reverse proxy crash logs, load balancer health checks, recent deploys.",
      };
    case "timeout":
      return {
        cause: "The server accepted the request but did not answer within 10 seconds.",
        lookAt: "Server CPU and memory, slow database queries, a hung app process, or an upstream API that is down.",
      };
    case "http_5xx":
      return {
        cause: `The server returned HTTP ${page.status}. The application crashed or is misconfigured while handling this request.`,
        lookAt: "Application error logs around the time below, recent deploys or plugin/theme updates, database connectivity, disk space.",
      };
    case "http_4xx":
      if (page.status === 404) {
        return {
          cause: "HTTP 404: nothing exists at this URL any more.",
          lookAt: "Was the page deleted, renamed, or unpublished? If it moved, add a 301 redirect from the old URL.",
        };
      }
      return {
        cause: `HTTP ${page.status}: the server refused the request.`,
        lookAt: "Authentication or access rules (401/403), rate limiting (429), or a firewall / bot protection blocking automated checks.",
      };
    default:
      return {
        cause: page.error || "Unexpected response.",
        lookAt: "Server logs around the time below.",
      };
  }
}

// The grey "For your developer" box. Same facts the incident row stores.
function technicalBlockHtml(page, { extraRows = [], recovered = false } = {}) {
  const result =
    page.status === null
      ? `No response (${page.errorType || "network"}: ${page.error || "unknown error"})`
      : `HTTP ${page.status}`;

  const rows = [
    ["URL", page.url],
    page.finalUrl ? ["Redirected to", page.finalUrl] : null,
    ["Result", result],
    page.errorCode ? ["Error code", page.errorCode] : null,
    ["Response time", `${page.responseTimeMs} ms`],
    ["Checked at", `${page.checkedAt || new Date().toISOString()} (UTC)`],
    recovered ? null : ["Confirmed", page.confirmed ? "Yes: failed 2 checks 30 seconds apart" : "Single check"],
    page.server ? ["Server header", page.server] : null,
    page.contentType ? ["Content-Type", page.contentType] : null,
    page.bodySnippet ? ["Response body", page.bodySnippet] : null,
    ...extraRows,
  ].filter(Boolean);

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 12px 3px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>` +
        `<td style="padding:3px 0;color:#111827;word-break:break-all;">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  const curl = `curl -sS -o /dev/null -w "%{http_code} in %{time_total}s" -L --max-time 10 "${page.url}"`;

  let notesHtml = "";
  if (!recovered) {
    const notes = developerNotes(page);
    notesHtml = `
      <p style="margin:12px 0 4px;font-size:12px;color:#6B7280;">Likely cause</p>
      <p style="margin:0;font-size:13px;color:#111827;">${escapeHtml(notes.cause)}</p>
      <p style="margin:12px 0 4px;font-size:12px;color:#6B7280;">Where to look</p>
      <p style="margin:0;font-size:13px;color:#111827;">${escapeHtml(notes.lookAt)}</p>
      <p style="margin:12px 0 4px;font-size:12px;color:#6B7280;">Reproduce</p>
      <pre style="margin:0;padding:8px;background:#111827;color:#E5E7EB;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-all;">${escapeHtml(curl)}</pre>`;
  }

  return `
    <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;margin-bottom:24px;font-family:Menlo,Consolas,monospace;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#374151;letter-spacing:0.5px;font-family:Arial,sans-serif;">FOR YOUR DEVELOPER</p>
      <table style="border-collapse:collapse;font-size:12px;width:100%;">${rowsHtml}</table>
      ${notesHtml}
    </div>`;
}

function headerHtml() {
  return `<div style="margin-bottom:24px;"><span style="font-size:13px;font-weight:600;color:#6366F1;letter-spacing:1px;">PROMPTHALL.SPACE</span></div>`;
}

function footerHtml(site) {
  return `
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
      <p style="font-size:12px;color:#9CA3AF;margin:0;">
        PromptHall.space &nbsp;|&nbsp; Your website. Our watch.<br/>
        Monitoring: ${escapeHtml(site.url)}
      </p>`;
}

export function renderIssueAlertHtml(site, page, description, recommendation) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#ffffff;">
      ${headerHtml()}
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#991B1B;">🔴 Issue detected</p>
        <p style="margin:6px 0 0;font-size:14px;color:#7F1D1D;">${escapeHtml(site.name || site.url)}</p>
      </div>

      <p style="font-size:16px;color:#111827;font-weight:600;margin:0 0 8px;">${escapeHtml(description)}</p>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;"><strong>What this means for you:</strong> ${escapeHtml(businessImpact(page))}</p>
      <p style="font-size:14px;color:#374151;margin:0 0 24px;">Affected page: <strong>${escapeHtml(page.url)}</strong></p>

      <div style="background:#F8FAFC;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827;">What to do</p>
        <p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(recommendation)}</p>
        <p style="margin:8px 0 0;font-size:14px;color:#374151;">You can forward this email to your web developer or hosting provider. The details they need are at the bottom.</p>
      </div>

      ${technicalBlockHtml(page)}

      <p style="font-size:14px;color:#374151;">PromptHall is still watching your website and will email you as soon as this is resolved.</p>
      ${footerHtml(site)}
    </div>`;
}

export function renderRecoveryAlertHtml(site, page, durationText, { detectedAt, resolvedAt } = {}) {
  const extraRows = [];
  if (detectedAt) extraRows.push(["Down since", `${detectedAt} (UTC)`]);
  if (resolvedAt) extraRows.push(["Back up at", `${resolvedAt} (UTC)`]);
  extraRows.push(["Total downtime", durationText]);

  return `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#ffffff;">
      ${headerHtml()}
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#166534;">🟢 Issue resolved</p>
        <p style="margin:6px 0 0;font-size:14px;color:#14532D;">${escapeHtml(site.name || site.url)}</p>
      </div>

      <p style="font-size:16px;color:#111827;font-weight:600;margin:0 0 8px;">Your ${escapeHtml(friendlyPageName(page.url))} is working normally again.</p>
      <p style="font-size:14px;color:#374151;margin:0 0 24px;">PromptHall confirmed the page is responding correctly on two checks in a row. The issue lasted <strong>${escapeHtml(durationText)}</strong>.</p>

      ${technicalBlockHtml(page, { extraRows, recovered: true })}

      <p style="font-size:14px;color:#374151;">No further action is needed. PromptHall will keep monitoring your website.</p>
      ${footerHtml(site)}
    </div>`;
}

async function send(site, subject, html, kind) {
  const { error } = await resend.emails.send({ from: FROM, to: site.owner_email, subject, html });
  if (error) {
    console.error(`Failed to send ${kind} alert for ${site.url}:`, error.message || error);
    return false;
  }
  console.log(`  [alert] ${kind} email sent to ${site.owner_email}`);
  return true;
}

export function sendIssueAlert(site, page, description, recommendation) {
  const subject = `Issue detected on ${site.name || site.url}`;
  return send(site, subject, renderIssueAlertHtml(site, page, description, recommendation), "issue");
}

export function sendRecoveryAlert(site, page, durationText, times = {}) {
  const subject = `Issue resolved on ${site.name || site.url}`;
  return send(site, subject, renderRecoveryAlertHtml(site, page, durationText, times), "recovery");
}
