// Shared HTML email template. Used by send-digest.js (weekly) and
// api/add-site.js (instant first check on signup).

export function renderEmailHtml(site, summary) {
  const alertBanner = summary.isRegression
    ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
         <strong>⚠️ Something broke this week</strong><br/>
         ${site.url} needs attention, see details below.
       </div>`
    : "";

  const bulletsHtml = summary.bullets.map((b) => `<li style="margin-bottom:6px;">${b}</li>`).join("");
  const recommendationsHtml = summary.recommendations
    .map((r) => `<li style="margin-bottom:8px;">${r}</li>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1A6BFF;margin-bottom:4px;">PromptHall Monitor</h2>
      <p style="color:#6B7280;margin-top:0;">Report for ${site.url}</p>
      ${alertBanner}
      <div style="font-size:36px;font-weight:bold;color:#111A3C;margin:16px 0;">
        ${summary.score}/100
      </div>
      <ul style="color:#374151;padding-left:20px;">${bulletsHtml}</ul>
      <div style="background:#F5F7FC;border-radius:8px;padding:14px 16px;margin-top:16px;">
        <strong style="color:#111A3C;">Recommendations:</strong>
        <ul style="color:#374151;padding-left:20px;margin-top:8px;margin-bottom:0;">${recommendationsHtml}</ul>
      </div>
      <p style="color:#9CA3AF;font-size:12px;margin-top:32px;">
        You're receiving this because ${site.url} is being monitored on PromptHall.
      </p>
    </div>
  `;
}
