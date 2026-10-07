// alert-mailer.js
// Sends alert emails to business owners. The top of every email is plain
// language with no jargon and says how the problem affects their business.
// A "For your developer" section at the bottom carries the technical facts,
// so the owner can forward the email as-is and the developer can act on it.

import { Resend } from "resend";
import { FROM, esc } from "./links.js";
import { layout, h1, p, small, strong, panel, pill, label, techTable, devBox, BRAND, MONO } from "./email-layout.js";

const resend = new Resend(process.env.RESEND_API_KEY);

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

// The "For your developer" box. Same facts the incident row stores.
function technicalBlockHtml(page, { extraRows = [], recovered = false } = {}) {
  const result = page.status === null
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
  ];
  let notes = "";
  if (!recovered) {
    const n = developerNotes(page);
    const curl = `curl -sS -o /dev/null -w "%{http_code} in %{time_total}s" -L --max-time 10 "${page.url}"`;
    notes = `
      <div style="height:12px;"></div>${label("Likely cause")}${p(esc(n.cause), "font-size:13px;margin-bottom:10px;")}
      ${label("Where to look")}${p(esc(n.lookAt), "font-size:13px;margin-bottom:10px;")}
      ${label("Reproduce")}<pre style="margin:0;padding:10px 12px;background:${BRAND.ink};color:#E9E6F6;border-radius:8px;font-family:${MONO};font-size:12px;white-space:pre-wrap;word-break:break-all;">${esc(curl)}</pre>`;
  }
  return devBox(techTable(rows) + notes);
}

export function renderIssueAlertHtml(site, page, description, recommendation) {
  const body = `
    ${pill("Issue detected", "bad")}
    <div style="height:14px;"></div>
    ${h1(esc(description))}
    ${p(`${strong("What this means for you:")} ${esc(businessImpact(page))}`)}
    ${p(`Affected page: ${strong(esc(page.url))}`, "font-size:14px;")}
    ${panel(`${label("What to do")}${p(esc(recommendation), "margin-bottom:8px;")}${p("You can forward this email to your web developer or hosting provider. Everything they need is in the box below.", "margin-bottom:0;font-size:14px;")}`)}
    ${technicalBlockHtml(page)}
    ${small("PromptHall is still watching your website and will email you as soon as this is resolved.")}`;
  return layout(site, { preheader: `${description} We'll email you when it's resolved.`, kicker: "Alert", body });
}

export function renderRecoveryAlertHtml(site, page, durationText, { detectedAt, resolvedAt } = {}) {
  const extraRows = [];
  if (detectedAt) extraRows.push(["Down since", `${detectedAt} (UTC)`]);
  if (resolvedAt) extraRows.push(["Back up at", `${resolvedAt} (UTC)`]);
  extraRows.push(["Total downtime", durationText]);
  const body = `
    ${pill("Issue resolved", "ok")}
    <div style="height:14px;"></div>
    ${h1(`Your ${esc(friendlyPageName(page.url))} is working normally again.`)}
    ${p(`PromptHall confirmed the page is responding correctly on two checks in a row. The issue lasted ${strong(esc(durationText))}.`)}
    ${technicalBlockHtml(page, { extraRows, recovered: true })}
    ${small("No further action is needed. PromptHall will keep monitoring your website.")}`;
  return layout(site, { preheader: `Resolved after ${durationText}.`, kicker: "Resolved", body });
}

async function send(site, subject, html, kind) {
  const { error } = await resend.emails.send({ from: FROM, to: site.owner_email, subject, html });
  if (error) { console.error(`Failed to send ${kind} alert for ${site.url}:`, error.message || error); return false; }
  console.log(`  [alert] ${kind} email sent to ${site.owner_email}`);
  return true;
}

export function sendIssueAlert(site, page, description, recommendation) {
  return send(site, `Issue detected on ${site.name || site.url}`, renderIssueAlertHtml(site, page, description, recommendation), "issue");
}

export function sendRecoveryAlert(site, page, durationText, times = {}) {
  return send(site, `Issue resolved on ${site.name || site.url}`, renderRecoveryAlertHtml(site, page, durationText, times), "recovery");
}
