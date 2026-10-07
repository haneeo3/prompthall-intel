// email-template.js
// Weekly report / first report email. Same structure as the alert emails:
// plain language for the owner on top, a "For your developer" box with the
// technical facts at the bottom. Used by send-digest.js and api/add-site.js.

import { emailFooterHtml } from "./links.js";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function scoreColor(score) {
  if (score >= 90) return "#15803D";
  if (score >= 50) return "#B45309";
  return "#B91C1C";
}

function scoreWord(score) {
  if (score >= 90) return "Fast";
  if (score >= 50) return "Could be faster";
  return "Slow";
}

function fmtTime(iso) {
  return iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "";
}

function row(k, v) {
  return (
    `<tr><td style="padding:3px 12px 3px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>` +
    `<td style="padding:3px 0;color:#111827;word-break:break-all;">${escapeHtml(v)}</td></tr>`
  );
}

// "This week" outage list, in plain language.
function incidentsHtml(summary) {
  if (summary.isFirstReport) return "";
  const items = summary.incidents;
  const body =
    items.length === 0
      ? `<p style="margin:0;font-size:14px;color:#166534;">🟢 No outages detected. Every page we checked stayed up all week.</p>`
      : items
          .map(
            (i) =>
              `<p style="margin:0 0 8px;font-size:14px;color:#374151;">${i.open ? "🔴" : "🟠"} <strong>${escapeHtml(i.page_url)}</strong><br/>` +
              `${i.open ? "Still down" : "Was down"} for ${escapeHtml(i.durationText)}, from ${escapeHtml(fmtTime(i.detected_at))}` +
              `${i.open ? "." : ` until ${escapeHtml(fmtTime(i.resolved_at))}.`}</p>`
          )
          .join("") +
        `<p style="margin:8px 0 0;font-size:13px;color:#6B7280;">Total downtime: <strong>${escapeHtml(summary.totalDowntimeText)}</strong>. You were emailed when each of these started and ended.</p>`;

  return `
      <div style="margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.5px;">THIS WEEK</p>
        ${body}
      </div>`;
}

function technicalBlockHtml(summary) {
  const l = summary.latest || {};
  const rows = [
    row("Performance score", `${summary.score}/100 (mobile, Google PageSpeed)`),
    row("Largest Contentful Paint", `${l.lcp ?? "-"} (target under 2.5 s)`),
    row("Cumulative Layout Shift", `${l.cls ?? "-"} (target under 0.1)`),
    row("Total Blocking Time", `${l.tbt ?? "-"} (target under 200 ms)`),
    row("Pages crawled", `${l.pages_checked ?? summary.brokenPages.length + summary.slowPages.length}`),
  ];
  const broken = summary.brokenPages
    .map((p) => row("Broken", `${p.url} -> ${p.status === null ? `no response (${p.error || "timeout"})` : `HTTP ${p.status}`}`))
    .join("");
  const slow = summary.slowPages
    .map((p) => row("Slow", `${p.url} -> ${(p.responseTimeMs / 1000).toFixed(1)} s response`))
    .join("");
  const incidents = summary.incidents
    .map((i) => row("Incident", `${i.page_url} | ${i.error_type || i.type}${i.status_code ? ` ${i.status_code}` : ""} | ${fmtTime(i.detected_at)} -> ${i.resolved_at ? fmtTime(i.resolved_at) : "open"}`))
    .join("");

  return `
      <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;margin-bottom:24px;font-family:Menlo,Consolas,monospace;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#374151;letter-spacing:0.5px;font-family:Arial,sans-serif;">FOR YOUR DEVELOPER</p>
        <table style="border-collapse:collapse;font-size:12px;width:100%;">${rows.join("")}${broken}${slow}${incidents}</table>
        <p style="margin:10px 0 0;font-size:11px;color:#6B7280;font-family:Arial,sans-serif;">Full Lighthouse data: run <span style="font-family:Menlo,Consolas,monospace;">https://pagespeed.web.dev/report?url=${escapeHtml(encodeURIComponent(summary.latest?.url || ""))}</span></p>
      </div>`;
}

export function renderEmailHtml(site, summary) {
  const title = summary.isFirstReport ? "Your first report" : "Your weekly report";
  const banner = summary.isRegression && !summary.isFirstReport
    ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
         <p style="margin:0;font-size:14px;color:#92400E;"><strong>⚠️ Needs attention.</strong> Something on your site broke or got noticeably slower this week. Details below.</p>
       </div>`
    : "";

  const bullets = summary.bullets.map((b) => `<li style="margin-bottom:6px;">${escapeHtml(b)}</li>`).join("");
  const recs = summary.recommendations.map((r) => `<li style="margin-bottom:8px;">${escapeHtml(r)}</li>`).join("");

  const withUrl = { ...summary, latest: { ...(summary.latest || {}), url: site.url } };

  return `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#ffffff;">
      <div style="margin-bottom:24px;"><span style="font-size:13px;font-weight:600;color:#6366F1;letter-spacing:1px;">PROMPTHALL.SPACE</span></div>

      <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">${escapeHtml(title)} for</p>
      <h2 style="margin:0 0 20px;font-size:20px;color:#111827;">${escapeHtml(site.name || site.url)}</h2>
      ${banner}

      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px;">
        <span style="font-size:40px;font-weight:bold;color:${scoreColor(summary.score)};">${summary.score}<span style="font-size:18px;color:#9CA3AF;">/100</span></span>
        <span style="font-size:15px;color:#374151;">${escapeHtml(scoreWord(summary.score))}</span>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">How fast your homepage loads on a phone. Slow sites lose visitors before the page even appears.</p>

      <ul style="color:#374151;font-size:14px;padding-left:20px;margin:0 0 24px;">${bullets}</ul>

      ${incidentsHtml(summary)}

      <div style="background:#F8FAFC;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;">What to do</p>
        <ul style="color:#374151;font-size:14px;padding-left:20px;margin:0;">${recs}</ul>
        <p style="margin:12px 0 0;font-size:13px;color:#6B7280;">Forward this email to your web developer. Everything they need is in the box below.</p>
      </div>

      ${technicalBlockHtml(withUrl)}

      <p style="font-size:14px;color:#374151;">${summary.isFirstReport
        ? "From now on we check your site every 5 minutes and email you within minutes if a page goes down, plus a report like this every Monday."
        : "We keep checking your site every 5 minutes. Your next report arrives next Monday."}</p>

      ${emailFooterHtml(site)}
    </div>`;
}
