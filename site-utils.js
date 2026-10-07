// site-utils.js
// Shared validation for site records. Used by api/add-site.js (public signup)
// and api/admin-data.js (admin create/update), so both clean data the same way.

export const MAX_IMPORTANT_PAGES = 10;

// "Example.com/" or "https://Example.com/" -> "https://example.com". Keeps paths as typed.
export function normaliseSiteUrl(input) {
  let s = String(input || "").trim();
  if (s && !/^https?:[/][/]/i.test(s)) s = "https://" + s;
  const u = new URL(s);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("URL must start with http:// or https://");
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  if (u.pathname === "/" && !u.search) return u.origin;
  return u.toString().replace(/[/]+$/, "");
}

// Accepts full URLs or paths like "/contact" (or a comma/newline separated
// string); drops anything not on the site; max MAX_IMPORTANT_PAGES.
export function normaliseImportantPages(list, siteUrl) {
  if (typeof list === "string") list = list.split(/[,;]|[^ -~]+/);
  if (!Array.isArray(list)) return [];
  const siteHost = new URL(siteUrl).hostname;
  const out = new Set();
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim(), siteUrl + "/");
      u.hash = "";
      if (u.hostname.toLowerCase() === siteHost) out.add(u.toString());
    } catch {}
    if (out.size >= MAX_IMPORTANT_PAGES) break;
  }
  return [...out];
}

export function normaliseEmail(input) {
  const e = String(input || "").trim().toLowerCase();
  if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(e)) throw new Error("Invalid email address");
  return e;
}
