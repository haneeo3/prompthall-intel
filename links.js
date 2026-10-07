// links.js
// Public URLs and signed links used in emails. The cancel link carries a
// signature so only someone holding the email can stop monitoring a site.

import { createHmac, timingSafeEqual } from "node:crypto";

export const APP_URL = (process.env.APP_URL || "https://prompthall-intel.vercel.app").replace(/[/]+$/, "");
export const FIX_EMAIL = process.env.FIX_EMAIL || "prompthall@gmail.com";
export const FROM = "PromptHall <monitor@prompthall.space>";

const secret = () => process.env.CANCEL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function cancelToken(siteId) {
  return createHmac("sha256", secret()).update(`cancel:${siteId}`).digest("hex").slice(0, 32);
}

export function verifyCancelToken(siteId, token) {
  const expected = cancelToken(siteId);
  if (typeof token !== "string" || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function cancelUrl(site) {
  return `${APP_URL}/api/cancel?site=${encodeURIComponent(site.id)}&token=${cancelToken(site.id)}`;
}

export function fixMailto(site) {
  const nl = String.fromCharCode(10);
  const subject = encodeURIComponent(`Please fix my website: ${site.url}`);
  const body = encodeURIComponent(`Website: ${site.url}${nl}What the alert said: ${nl}`);
  return `mailto:${FIX_EMAIL}?subject=${subject}&body=${body}`;
}

export const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Standard footer for every email: who we are, the site, fix + cancel links.
export function emailFooterHtml(site) {
  return `
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
      <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.7;">
        PromptHall.space &nbsp;|&nbsp; Your website. Our watch.<br/>
        Monitoring: ${esc(site.url)} &nbsp;·&nbsp; Free pilot<br/>
        Need a fix? Reply to this email or <a href="${fixMailto(site)}" style="color:#6B7280;">request a fix</a>.
        &nbsp;·&nbsp; <a href="${cancelUrl(site)}" style="color:#6B7280;">Stop monitoring this site</a>
      </p>`;
}
