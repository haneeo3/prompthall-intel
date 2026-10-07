// onboard-site.js
// Everything that happens right after a site is added, from the public
// signup page OR the admin dashboard: welcome email, first check, first report.

import { Resend } from "resend";
import { checkSite } from "./site-checker.js";
import { buildSummary } from "./digest-summary.js";
import { renderEmailHtml } from "./email-template.js";
import { sendWelcomeEmail } from "./welcome-mailer.js";
import { FROM } from "./links.js";

export async function onboardSite(supabase, site, { isUpdate = false } = {}) {
  // 1. Welcome email (skipped when an existing site is just being updated).
  if (!isUpdate) await sendWelcomeEmail(site);

  // 2. First check, saved to scores.
  const result = await checkSite(site.url);
  const { error } = await supabase.from("scores").insert({ site_id: site.id, ...result });
  if (error) throw new Error(error.message);

  // 3. First report.
  const summary = buildSummary([{ ...result, checked_at: new Date().toISOString() }]);
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to: site.owner_email,
    subject: `${site.name || site.url}: your first PromptHall report (${summary.score}/100)`,
    html: renderEmailHtml(site, summary),
  });
  return summary;
}
