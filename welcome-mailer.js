// welcome-mailer.js
// The first email a new site owner gets, before the first report: what the
// free pilot is, when they will hear from us, how to request a fix, how to stop.

import { Resend } from "resend";
import { FROM, esc, fixMailto, cancelUrl } from "./links.js";
import { layout, h1, p, small, label, strong, link, button, panel, pill } from "./email-layout.js";

export function renderWelcomeHtml(site) {
  const name = site.name || site.url;
  const body = `
    ${pill("Welcome · free pilot", "purple")}
    <div style="height:14px;"></div>
    ${h1(`We're now watching ${esc(name)}.`)}
    ${p(`You're using PromptHall ${strong("free of charge")} during our pilot — no card, no contract. In return we only ask one thing: tell us when an email was useful, confusing or late. That's how we're building this.`)}

    ${panel(`
      ${label("What happens from here")}
      ${p(`${strong("In about a minute")} — your first report lands in a separate email.`, "margin-bottom:8px;")}
      ${p(`${strong("Every 5 minutes")} — we check your site. If a page breaks you get one email within minutes, and another when it's fixed.`, "margin-bottom:8px;")}
      ${p(`${strong("Every Monday, 8am")} — a report of the week. Otherwise, silence.`, "margin-bottom:0;")}
    `)}

    ${panel(`
      ${label("If something breaks and you need it fixed")}
      ${p(`Every alert ends with a ${strong("“For your developer”")} section. Forward the email and they can start straight away.`, "margin-bottom:8px;")}
      ${p(`No developer, or they're not responding? Request a fix and we'll connect you with one of ours. You get a quote before any work starts.`, "margin-bottom:12px;")}
      ${button(fixMailto(site), "Request a fix")}
    `, "purple")}

    ${small(`Changed your mind? ${link(cancelUrl(site), "Stop monitoring this site")} — one click, no questions.`)}
  `;
  return layout(site, { preheader: `You're on the free PromptHall pilot. Your first report is on its way.`, kicker: "Welcome", body });
}

export async function sendWelcomeEmail(site) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM,
    to: site.owner_email,
    subject: `Welcome to PromptHall — we're now watching ${site.name || site.url}`,
    html: renderWelcomeHtml(site),
  });
  if (error) console.error(`Failed to send welcome email for ${site.url}:`, error.message || error);
  return !error;
}
