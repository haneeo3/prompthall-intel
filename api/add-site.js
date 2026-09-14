// Vercel serverless function: POST /api/add-site
// Called by signup.html instead of inserting directly from the browser.
// Adds the site, runs the first check immediately, saves it, and emails
// the result right away, so the person sees value the moment they sign up.
// The weekly cron (check-all-sites.js / send-digest.js) takes over after that.

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { checkSite } from "../site-checker.js";
import { buildSummary } from "../digest-summary.js";
import { renderEmailHtml } from "../email-template.js";

// This function runs server-side only (never shipped to the browser), so
// it's safe to use the service_role key here, set it in Vercel's project
// environment variables, not in any client-facing file.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, email, name } = req.body || {};

  if (!url || !email) {
    return res.status(400).json({ error: "url and email are required" });
  }

  try {
    // 1. Save the site.
    const { data: site, error: insertError } = await supabase
      .from("sites")
      .insert({ url, owner_email: email, name: name || null })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    // 2. Run the first check immediately, don't make them wait for Monday.
    const result = await checkSite(url);

    const { error: scoreError } = await supabase.from("scores").insert({
      site_id: site.id,
      ...result,
    });
    if (scoreError) throw new Error(scoreError.message);

    // 3. Email the first report right away.
    const summary = buildSummary([{ ...result, checked_at: new Date().toISOString() }]);
    const html = renderEmailHtml(site, summary);

    await resend.emails.send({
      from: "PromptHall Monitor <monitor@prompthall.space>",
      to: email,
      subject: `${url} — your first report (${summary.score}/100)`,
      html,
    });

    return res.status(200).json({ ok: true, score: summary.score });
  } catch (err) {
    console.error("add-site failed:", err.message);
    return res.status(500).json({ error: "Something went wrong, please try again." });
  }
}