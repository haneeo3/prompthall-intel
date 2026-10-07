// Vercel serverless function: POST /api/add-site
// Called by index.html. Adds the site (or updates it if this person already
// monitors this URL), runs the first check immediately, saves it, and emails
// the first report right away. The schedulers take over after that.

import { createClient } from "@supabase/supabase-js";
import { onboardSite } from "../onboard-site.js";
import { normaliseSiteUrl, normaliseImportantPages } from "../site-utils.js";

// Server-side only: never ship the service_role key to the browser.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url: rawUrl, email: rawEmail, name, important_pages } = req.body || {};
  if (!rawUrl || !rawEmail) return res.status(400).json({ error: "url and email are required" });

  let url;
  try {
    url = normaliseSiteUrl(rawUrl);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a valid website address." });
  }
  const email = String(rawEmail).trim().toLowerCase();
  const importantPages = normaliseImportantPages(important_pages, url);

  try {
    // 1. Save the site, or update it if this email already monitors this URL
    //    (so double-submits don't create duplicate alerts).
    const { data: existing } = await supabase
      .from("sites")
      .select("id")
      .eq("url", url)
      .ilike("owner_email", email)
      .maybeSingle();

    const fields = { url, owner_email: email, name: name || null, important_pages: importantPages };
    const query = existing
      ? supabase.from("sites").update(fields).eq("id", existing.id)
      : supabase.from("sites").insert(fields);
    const { data: site, error: saveError } = await query.select().single();
    if (saveError) throw new Error(saveError.message);

    // 2. Welcome email, first check, first report (shared with the admin dashboard).
    const summary = await onboardSite(supabase, site, { isUpdate: Boolean(existing) });

    return res.status(200).json({ ok: true, score: summary.score, updated: Boolean(existing) });
  } catch (err) {
    console.error("add-site failed:", err.message);
    return res.status(500).json({ error: "Something went wrong, please try again." });
  }
}
