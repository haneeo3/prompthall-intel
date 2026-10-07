// email-template.js
// Weekly report / first report email on the shared PromptHall layout.
// Plain language for the owner on top, "For your developer" box at the bottom.
// Used by send-digest.js and onboard-site.js.

import { esc } from "./links.js";
import { layout, h1, p, small, label, strong, panel, pill, techTable, devBox, BRAND, FONT } from "./email-layout.js";

const scoreColor = (s) => (s >= 90 ? BRAND.ok : s >= 50 ? BRAND.warn : BRAND.bad);
const scoreWord = (s) => (s >= 90 ? "Fast" : s >= 50 ? "Could be faster" : "Slow");
const fmtTime = (iso) => (iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "");

function incidentsHtml(summary) {
  if (summary.isFirstReport) return "";
  const items = summary.incidents;
  if (items.length === 0) {
    return panel(`${label("This week")}${p("🟢 No outages detected. Every page we checked stayed up all week.", "margin-bottom:0;color:" + BRAND.ok + ";")}`, "ok");
  }
  const rows = items.map((i) =>
    p(`${i.open ? "🔴" : "🟠"} ${strong(esc(i.page_url))}<br/>${i.open ? "Still down" : "Was down"} for ${esc(i.durationText)}, from ${esc(fmtTime(i.detected_at))}${i.open ? "." : ` until ${esc(fmtTime(i.resolved_at))}.`}`, "font-size:14px;margin-bottom:10px;")
  ).join("");
  return panel(`${label("This week")}${rows}${small(`Total downtime: ${strong(esc(summary.totalDowntimeText))}. You were emailed when each of these started and ended.`)}`, items.some((i) => i.open) ? "bad" : "warn");
}

function technicalBlockHtml(site, summary) {
  const l = summary.latest || {};
  const rows = [
    ["Performance score", `${summary.score}/100 (mobile, Google PageSpeed)`],
    ["Largest Contentful Paint", `${l.lcp ?? "-"} (target under 2.5 s)`],
    ["Cumulative Layout Shift", `${l.cls ?? "-"} (target under 0.1)`],
    ["Total Blocking Time", `${l.tbt ?? "-"} (target under 200 ms)`],
    ["Pages crawled", `${l.pages_checked ?? summary.brokenPages.length + summary.slowPages.length}`],
    ...summary.brokenPages.map((pg) => ["Broken", `${pg.url} -> ${pg.status === null ? `no response (${pg.error || "timeout"})` : `HTTP ${pg.status}`}`]),
    ...summary.slowPages.map((pg) => ["Slow", `${pg.url} -> ${(pg.responseTimeMs / 1000).toFixed(1)} s response`]),
    ...summary.incidents.map((i) => ["Incident", `${i.page_url} | ${i.error_type || i.type}${i.status_code ? ` ${i.status_code}` : ""} | ${fmtTime(i.detected_at)} -> ${i.resolved_at ? fmtTime(i.resolved_at) : "open"}`]),
  ];
  const ps = `https://pagespeed.web.dev/report?url=${encodeURIComponent(site.url)}`;
  return devBox(techTable(rows) + `<div style="height:8px;"></div>${small(`Full Lighthouse data: <a href="${ps}" style="color:${BRAND.muted};">pagespeed.web.dev</a>`)}`);
}

export function renderEmailHtml(site, summary) {
  const first = summary.isFirstReport;
  const kicker = first ? "First report" : "Weekly report";
  const attention = summary.isRegression && !first;
  const bullets = summary.bullets.map((b) => `<li style="margin:0 0 6px;">${esc(b)}</li>`).join("");
  const recs = summary.recommendations.map((r) => `<li style="margin:0 0 8px;">${esc(r)}</li>`).join("");

  const body = `
    ${pill(first ? "Your first report" : attention ? "Needs attention" : "Weekly report", first ? "purple" : attention ? "warn" : "ok")}
    <div style="height:14px;"></div>
    ${h1(esc(site.name || site.url))}
    ${attention ? panel(`${p(`${strong("⚠️ Something needs attention.")} A page broke or your site got noticeably slower this week. Details below.`, "margin-bottom:0;")}`, "warn") : ""}

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 4px;"><tr>
      <td style="font-family:${FONT};font-size:48px;font-weight:700;letter-spacing:-1.5px;line-height:1;color:${scoreColor(summary.score)};">${summary.score}<span style="font-size:18px;font-weight:500;color:${BRAND.muted};letter-spacing:0;">/100</span></td>
      <td style="padding-left:14px;font-family:${FONT};font-size:16px;color:${BRAND.text};vertical-align:bottom;padding-bottom:6px;">${scoreWord(summary.score)}</td>
    </tr></table>
    ${small("How fast your homepage loads on a phone. Slow sites lose visitors before the page even appears.")}
    <div style="height:16px;"></div>

    <ul style="margin:0 0 20px;padding-left:20px;font-family:${FONT};font-size:14.5px;line-height:1.6;color:${BRAND.text};">${bullets}</ul>

    ${incidentsHtml(summary)}

    ${panel(`${label("What to do")}<ul style="margin:0 0 10px;padding-left:20px;font-family:${FONT};font-size:14.5px;line-height:1.6;color:${BRAND.text};">${recs}</ul>${small("Forward this email to your web developer. Everything they need is in the box below.")}`)}

    ${technicalBlockHtml(site, summary)}

    ${small(first
      ? "From now on we check your site every 5 minutes and email you within minutes if a page goes down, plus a report like this every Monday."
      : "We keep checking your site every 5 minutes. Your next report arrives next Monday.")}`;

  return layout(site, { preheader: `${summary.score}/100, ${scoreWord(summary.score)}. ${summary.bullets[0] || ""}`, kicker, body });
}
