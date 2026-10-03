// Vercel serverless function: GET /api/admin-data
// Data for the private admin dashboard (admin.html). Protected by ADMIN_TOKEN
// (set in Vercel project environment variables), sent as
// "Authorization: Bearer <token>".
//
//   GET /api/admin-data            -> all sites with current status + 7-day stats
//   GET /api/admin-data?site=<id>  -> one site's pages, incidents and check history

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function authorised(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  res.setHeader("Cache-Control", "no-store");

  try {
    const siteId = req.query?.site;
    if (!siteId) {
      const { data, error } = await supabase.from("admin_site_status").select("*").order("url");
      if (error) throw new Error(error.message);
      return res.status(200).json({ generatedAt: new Date().toISOString(), sites: data });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [site, latest, checks, incidents, scores] = await Promise.all([
      supabase.from("sites").select("*").eq("id", siteId).single(),
      supabase.from("uptime_checks").select("checked_at, results_json").eq("site_id", siteId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("uptime_checks").select("checked_at, homepage_ok, homepage_response_ms, pages_checked, pages_broken, pages_slow").eq("site_id", siteId).gte("checked_at", since).order("checked_at", { ascending: false }).limit(2500),
      supabase.from("incidents").select("*").eq("site_id", siteId).order("detected_at", { ascending: false }).limit(100),
      supabase.from("scores").select("checked_at, performance_score, lcp, cls, tbt, pages_checked, pages_broken_count, pages_slow_count").eq("site_id", siteId).order("checked_at", { ascending: false }).limit(12),
    ]);
    for (const r of [site, latest, checks, incidents, scores]) if (r.error) throw new Error(r.error.message);

    return res.status(200).json({
      site: site.data,
      pages: latest.data?.results_json || [],
      lastCheckedAt: latest.data?.checked_at || null,
      checks: checks.data,
      incidents: incidents.data,
      scores: scores.data,
    });
  } catch (err) {
    console.error("admin-data failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
