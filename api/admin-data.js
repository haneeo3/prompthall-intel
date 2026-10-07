// Vercel serverless function: GET /api/admin-data
// Data for the private admin dashboard (admin.html). Protected by ADMIN_TOKEN
// (set in Vercel project environment variables), sent as
// "Authorization: Bearer <token>".
//
//   GET    /api/admin-data            -> all sites with current status + 7-day stats
//   GET    /api/admin-data?site=<id>  -> one site's pages, incidents and check history
//   POST   /api/admin-data            -> create a site  { url, owner_email, name?, important_pages? }
//   PATCH  /api/admin-data?site=<id>  -> update a site  (same fields, any subset)
//   DELETE /api/admin-data?site=<id>  -> delete a site and all its checks, scores and incidents
// Sites created here are NOT checked immediately or emailed; the 5-minute
// monitor picks them up on its next run.

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { normaliseSiteUrl, normaliseImportantPages, normaliseEmail } from "../site-utils.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function authorised(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Build the fields to save from a request body. Partial for updates.
function siteFields(body, current = {}) {
  const out = {};
  const url = body.url !== undefined ? normaliseSiteUrl(body.url) : current.url;
  if (body.url !== undefined) out.url = url;
  if (body.owner_email !== undefined) out.owner_email = normaliseEmail(body.owner_email);
  if (body.name !== undefined) out.name = String(body.name || "").trim() || null;
  if (body.important_pages !== undefined) out.important_pages = normaliseImportantPages(body.important_pages, url);
  return out;
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  res.setHeader("Cache-Control", "no-store");

  try {
    const siteId = req.query?.site;

    if (req.method === "POST") {
      const body = req.body || {};
      if (!body.url || !body.owner_email) return res.status(400).json({ error: "url and owner_email are required" });
      const fields = siteFields(body);
      const { data, error } = await supabase.from("sites").insert(fields).select().single();
      if (error) throw new Error(error.message);
      return res.status(201).json({ site: data });
    }

    if (req.method === "PATCH") {
      if (!siteId) return res.status(400).json({ error: "site id required" });
      const { data: current, error: e0 } = await supabase.from("sites").select("*").eq("id", siteId).single();
      if (e0) return res.status(404).json({ error: "Site not found" });
      const fields = siteFields(req.body || {}, current);
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: "Nothing to update" });
      const { data, error } = await supabase.from("sites").update(fields).eq("id", siteId).select().single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ site: data });
    }

    if (req.method === "DELETE") {
      if (!siteId) return res.status(400).json({ error: "site id required" });
      // Children first in case a foreign key has no cascade.
      for (const table of ["incidents", "uptime_checks", "scores"]) {
        const { error } = await supabase.from(table).delete().eq("site_id", siteId);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      const { error } = await supabase.from("sites").delete().eq("id", siteId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }
    if (!siteId) {
      const { data, error } = await supabase.from("admin_site_status").select("*").order("url");
      if (error) throw new Error(error.message);
      return res.status(200).json({ generatedAt: new Date().toISOString(), sites: data });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [site, latest, checks, incidents, scores] = await Promise.all([
      supabase.from("sites").select("*").eq("id", siteId).maybeSingle(),
      supabase.from("uptime_checks").select("checked_at, results_json").eq("site_id", siteId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("uptime_checks").select("checked_at, homepage_ok, homepage_response_ms, pages_checked, pages_broken, pages_slow").eq("site_id", siteId).gte("checked_at", since).order("checked_at", { ascending: false }).limit(2500),
      supabase.from("incidents").select("*").eq("site_id", siteId).order("detected_at", { ascending: false }).limit(100),
      supabase.from("scores").select("checked_at, performance_score, lcp, cls, tbt, pages_checked, pages_broken_count, pages_slow_count").eq("site_id", siteId).order("checked_at", { ascending: false }).limit(12),
    ]);
    for (const r of [site, latest, checks, incidents, scores]) if (r.error) throw new Error(r.error.message);
    if (!site.data) return res.status(404).json({ error: "Site not found" });

    return res.status(200).json({
      site: site.data,
      pages: latest.data?.results_json || [],
      lastCheckedAt: latest.data?.checked_at || null,
      checks: checks.data,
      incidents: incidents.data,
      scores: scores.data,
    });
  } catch (err) {
    const isInput = /Invalid|URL must|Invalid URL/i.test(err.message);
    if (!isInput) console.error("admin-data failed:", err.message);
    return res.status(isInput ? 400 : 500).json({ error: isInput ? "Check the website address and email." : err.message });
  }
}
