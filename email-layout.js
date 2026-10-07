// email-layout.js
// One shared look for every PromptHall email: logo, purple accent, soft
// lavender background, white card, consistent footer. Built with tables and
// inline styles because email clients ignore most modern CSS.

import { APP_URL, esc, fixMailto, cancelUrl } from "./links.js";

export const BRAND = {
  purple: "#7C5CFF", purpleDeep: "#5B3FE0", purpleSoft: "#F1EDFF", purpleLine: "#D9D0FF",
  ink: "#15121F", text: "#3F3B52", muted: "#7A7690", line: "#ECE9F6", bg: "#F4F2FB", card: "#FFFFFF",
  ok: "#15803D", okSoft: "#ECFDF3", bad: "#B91C1C", badSoft: "#FEF2F2", warn: "#B45309", warnSoft: "#FFF7E6",
};
export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
export const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
export const LOGO_URL = `${APP_URL}/assets/logo.png`;

// Small reusable pieces -------------------------------------------------
export const h1 = (t) => `<h1 style="margin:0 0 10px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:600;color:${BRAND.ink};letter-spacing:-0.3px;">${t}</h1>`;
export const p = (t, extra = "") => `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.text};${extra}">${t}</p>`;
export const small = (t) => `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">${t}</p>`;
export const label = (t) => `<p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.muted};">${t}</p>`;
export const strong = (t) => `<strong style="color:${BRAND.ink};font-weight:600;">${t}</strong>`;
export const link = (href, t) => `<a href="${href}" style="color:${BRAND.purple};text-decoration:none;font-weight:500;">${t}</a>`;

export function button(href, text, { variant = "primary" } = {}) {
  const bg = variant === "primary" ? BRAND.purple : BRAND.card;
  const color = variant === "primary" ? "#FFFFFF" : BRAND.ink;
  const border = variant === "primary" ? BRAND.purple : BRAND.purpleLine;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 0;"><tr><td style="border-radius:999px;background:${bg};border:1px solid ${border};">
    <a href="${href}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:${color};text-decoration:none;border-radius:999px;">${text}</a></td></tr></table>`;
}

// A soft panel. tone: "neutral" | "purple" | "ok" | "bad" | "warn"
export function panel(inner, tone = "neutral") {
  const t = { neutral: [BRAND.bg, BRAND.line], purple: [BRAND.purpleSoft, BRAND.purpleLine], ok: [BRAND.okSoft, "#BBF7D0"], bad: [BRAND.badSoft, "#FECACA"], warn: [BRAND.warnSoft, "#FDE68A"] }[tone];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;"><tr><td style="background:${t[0]};border:1px solid ${t[1]};border-radius:12px;padding:16px 18px;">${inner}</td></tr></table>`;
}

// Status pill at the top of alerts: "Issue detected" / "Issue resolved" / "Weekly report"
export function pill(text, tone = "purple") {
  const c = { purple: [BRAND.purpleSoft, BRAND.purpleDeep], ok: [BRAND.okSoft, BRAND.ok], bad: [BRAND.badSoft, BRAND.bad], warn: [BRAND.warnSoft, BRAND.warn] }[tone];
  return `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${c[0]};color:${c[1]};font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.2px;">${text}</span>`;
}

// Monospace technical table rows for the developer box.
export function techTable(rows) {
  const tr = rows.filter(Boolean).map(([k, v]) =>
    `<tr><td style="padding:4px 14px 4px 0;font-family:${MONO};font-size:12px;color:${BRAND.muted};white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
    `<td style="padding:4px 0;font-family:${MONO};font-size:12px;color:${BRAND.ink};word-break:break-all;">${esc(v)}</td></tr>`).join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">${tr}</table>`;
}

export function devBox(inner) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;"><tr><td style="background:#F7F6FB;border:1px solid ${BRAND.line};border-radius:12px;padding:16px 18px;">
    ${label("For your developer")}${inner}</td></tr></table>`;
}

// The wrapper ---------------------------------------------------------------
export function layout(site, { preheader = "", body = "", kicker = "" }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>PromptHall</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
  <tr><td style="padding:0 6px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      <td style="vertical-align:middle;"><a href="https://prompthall.space" style="text-decoration:none;"><img src="${LOGO_URL}" width="132" height="44" alt="PromptHall" style="display:block;border:0;height:44px;width:auto;"/></a></td>
      <td align="right" style="vertical-align:middle;font-family:${MONO};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.muted};">${esc(kicker)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${BRAND.card};border-radius:16px;border-top:4px solid ${BRAND.purple};padding:30px 32px 26px;box-shadow:0 4px 24px rgba(21,18,31,0.06);">
    ${body}
  </td></tr>
  <tr><td style="padding:22px 10px 0;">
    <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.muted};">
      Monitoring ${esc(site.url)} &nbsp;·&nbsp; Free pilot &nbsp;·&nbsp; Every 5 minutes, Lagos time
    </p>
    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${BRAND.muted};">
      Need a fix? Reply to this email or <a href="${fixMailto(site)}" style="color:${BRAND.muted};">request a fix</a>.
      &nbsp;·&nbsp; <a href="${cancelUrl(site)}" style="color:${BRAND.muted};">Stop monitoring this site</a>
    </p>
    <p style="margin:12px 0 0;font-family:${FONT};font-size:11px;color:#A8A4BC;">PromptHall.space. Your website. Our watch.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
