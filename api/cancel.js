// Vercel serverless function: /api/cancel?site=<id>&token=<signature>
// Linked from the bottom of every email. GET shows a confirmation page;
// POST (the button on that page) deletes the site and all its data, so the
// owner never hears from us again. The token is an HMAC of the site id, so
// only someone with the email can use the link.

import { createClient } from "@supabase/supabase-js";
import { verifyCancelToken, APP_URL, esc } from "../links.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function page(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/><title>${esc(title)} — PromptHall</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet"/>
<style>
  body{margin:0;background:#0E0C16;color:#F3F1FA;font-family:Inter,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:560px;margin:0 auto;padding:96px 24px}
  .k{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6E6889;margin:0 0 24px}
  h1{font-size:clamp(32px,6vw,52px);line-height:1;letter-spacing:-.03em;font-weight:500;margin:0 0 20px}
  h1 em{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;color:#8B6CFF}
  p{color:#A9A3C2;font-size:17px;line-height:1.6;margin:0 0 14px}
  p strong{color:#F3F1FA;font-weight:500}
  .row{display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-top:36px}
  button,.btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;background:#F3F1FA;color:#0E0C16;font-weight:500;font-size:16px;padding:16px 24px;border-radius:999px}
  button:hover{background:#8B6CFF}
  a.link{color:#A9A3C2;border-bottom:1px solid rgba(243,241,250,.25);padding-bottom:2px}
  a.link:hover{color:#F3F1FA}
</style></head><body><main>${body}</main></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const siteId = String(req.query?.site || "");
  const token = String(req.query?.token || "");

  if (!siteId || !verifyCancelToken(siteId, token)) {
    return res.status(400).send(page("Link not valid", `<p class="k">PromptHall</p><h1>This link isn't <em>valid.</em></h1><p>It may have been copied incompletely. Open the email again and click "Stop monitoring this site", or reply to any PromptHall email and we'll do it for you.</p>`));
  }

  const { data: site } = await supabase.from("sites").select("id, url, name, owner_email").eq("id", siteId).maybeSingle();

  if (!site) {
    return res.status(200).send(page("Already stopped", `<p class="k">PromptHall</p><h1>Already <em>stopped.</em></h1><p>This site is no longer monitored. You won't receive any more emails about it.</p><div class="row"><a class="btn" href="${APP_URL}">Add a site</a></div>`));
  }

  if (req.method === "POST") {
    for (const table of ["incidents", "uptime_checks", "scores"]) {
      const { error } = await supabase.from(table).delete().eq("site_id", site.id);
      if (error) return res.status(500).send(page("Something went wrong", `<p class="k">PromptHall</p><h1>Something went <em>wrong.</em></h1><p>We couldn't complete this. Reply to any PromptHall email and we'll stop monitoring for you.</p>`));
    }
    const { error } = await supabase.from("sites").delete().eq("id", site.id);
    if (error) return res.status(500).send(page("Something went wrong", `<p class="k">PromptHall</p><h1>Something went <em>wrong.</em></h1><p>Reply to any PromptHall email and we'll stop monitoring for you.</p>`));
    console.log(`[cancel] ${site.owner_email} stopped monitoring ${site.url}`);
    return res.status(200).send(page("Monitoring stopped", `<p class="k">PromptHall</p><h1>Monitoring <em>stopped.</em></h1><p>We've removed <strong>${esc(site.url)}</strong> and everything we recorded about it. No more emails will be sent to <strong>${esc(site.owner_email)}</strong> about this site.</p><p>If this was a mistake, you can add it again any time.</p><div class="row"><a class="btn" href="${APP_URL}">Add a site</a></div>`));
  }

  return res.status(200).send(page("Stop monitoring?", `<p class="k">PromptHall · free pilot</p><h1>Stop monitoring <em>${esc(site.name || site.url)}?</em></h1>
    <p>We'll remove <strong>${esc(site.url)}</strong> and stop all emails to <strong>${esc(site.owner_email)}</strong> — alerts, recovery notices and the Monday report. The history we recorded is deleted too.</p>
    <p>If you only want fewer emails, reply to any PromptHall email instead and tell us — we can adjust.</p>
    <form method="POST" action="/api/cancel?site=${encodeURIComponent(site.id)}&token=${encodeURIComponent(token)}" class="row">
      <button type="submit">Yes, stop monitoring</button>
      <a class="link" href="${APP_URL}/welcome.html">No, keep it</a>
    </form>`));
}
