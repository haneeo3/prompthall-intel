// incident-manager.js
// Handles the full incident lifecycle:
// - Open a new incident when something breaks
// - Skip duplicate alerts if already open
// - Close and send recovery alert when fixed
// This is what prevents 24 emails per day for one outage.

import { createClient } from "@supabase/supabase-js";
import { sendIssueAlert, sendRecoveryAlert } from "./alert-mailer.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Call this after every check for a site.
// results = array of { url, ok, status, responseTimeMs, slow }
// site = the site row from the database
export async function processCheckResults(site, results) {
  for (const page of results) {
    if (!page.ok) {
      await handlePageDown(site, page);
    } else {
      await handlePageRecovered(site, page);
    }
  }
}

async function handlePageDown(site, page) {
  // Check if there is already an open incident for this page.
  const { data: existing } = await supabase
    .from("incidents")
    .select("id")
    .eq("site_id", site.id)
    .eq("page_url", page.url)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing) {
    // Incident already open. Do nothing. No duplicate alert.
    console.log(`  [incident] already open for ${page.url}, skipping alert`);
    return;
  }

  // New incident. Create it and send alert.
  const description = friendlyDescription(page);
  const recommendation = friendlyRecommendation(page);

  const { error: insertError } = await supabase
    .from("incidents")
    .insert({
      site_id: site.id,
      page_url: page.url,
      type: classifyIssue(page),
      severity: page.status === null ? "critical" : "warning",
      description,
      recommendation,
      // Technical facts for developers; same data shown in the email.
      status_code: page.status,
      error_type: page.errorType || null,
      response_time_ms: page.responseTimeMs ?? null,
      technical_details: {
        checked_at: page.checkedAt || null,
        final_url: page.finalUrl || null,
        error: page.error || null,
        error_code: page.errorCode || null,
        server: page.server || null,
        content_type: page.contentType || null,
        body_snippet: page.bodySnippet || null,
        checks_failed: page.confirmed ? 2 : 1,
      },
    });

  if (insertError) {
    // Don't alert if we couldn't record the incident, otherwise the same
    // email would be re-sent on every run. The next run will retry.
    console.error(`  [incident] failed to record incident for ${page.url}: ${insertError.message}`);
    return;
  }

  console.log(`  [incident] opened for ${page.url} (${page.status ?? "no response"})`);

  // Send one alert email.
  if (site.owner_email) {
    await sendIssueAlert(site, page, description, recommendation);
  }
}

async function handlePageRecovered(site, page) {
  // Check if there was an open incident for this page.
  const { data: existing } = await supabase
    .from("incidents")
    .select("id, detected_at")
    .eq("site_id", site.id)
    .eq("page_url", page.url)
    .is("resolved_at", null)
    .maybeSingle();

  if (!existing) {
    // No open incident. Page is healthy. Nothing to do.
    return;
  }

  // Close the incident and calculate how long it was down.
  const resolvedAt = new Date();
  const detectedAt = new Date(existing.detected_at);
  const durationMs = resolvedAt - detectedAt;
  const durationText = formatDuration(durationMs);

  const { error: updateError } = await supabase
    .from("incidents")
    .update({ resolved_at: resolvedAt.toISOString() })
    .eq("id", existing.id);

  if (updateError) {
    console.error(`  [incident] failed to close incident for ${page.url}: ${updateError.message}`);
    return;
  }

  console.log(`  [incident] resolved for ${page.url} (was down ${durationText})`);

  // Send one recovery alert.
  if (site.owner_email) {
    await sendRecoveryAlert(site, page, durationText, {
      detectedAt: detectedAt.toISOString(),
      resolvedAt: resolvedAt.toISOString(),
    });
  }
}

function classifyIssue(page) {
  if (page.status === null) return "downtime";
  if (page.status >= 500) return "server_error";
  if (page.status >= 400) return "page_error";
  if (page.slow) return "performance";
  return "unknown";
}

function friendlyDescription(page) {
  const pageName = friendlyPageName(page.url);

  if (page.status === null) {
    return `Your ${pageName} is not responding. Visitors cannot access this page.`;
  }
  if (page.status === 404) {
    return `Your ${pageName} cannot be found. Visitors are seeing a "page not found" error.`;
  }
  if (page.status >= 500) {
    return `Your ${pageName} is experiencing a server error. Visitors cannot use this page.`;
  }
  if (page.status >= 400) {
    return `Your ${pageName} is returning an error (${page.status}). Visitors may not be able to access it.`;
  }
  if (page.slow) {
    return `Your ${pageName} is loading very slowly (${(page.responseTimeMs / 1000).toFixed(1)} seconds). Visitors may leave before it loads.`;
  }
  return `An issue was detected on your ${pageName}.`;
}

function friendlyRecommendation(page) {
  if (page.status === null) {
    return "Check that your website hosting is active and your domain is pointing correctly. Contact your web developer or hosting provider.";
  }
  if (page.status === 404) {
    return "This page may have been deleted or the link may be incorrect. Ask your web developer to restore or redirect it.";
  }
  if (page.status >= 500) {
    return "Your website server encountered an error. Ask your web developer to check the server logs and recent changes to the site.";
  }
  if (page.slow) {
    return "This page is loading slowly. Ask your web developer to investigate large images, plugins, or server performance issues.";
  }
  return "Contact your web developer to investigate this issue.";
}

function friendlyPageName(url) {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "homepage";
    const segment = path.replace(/\/$/, "").split("/").pop();
    return `${segment} page`;
  } catch {
    return "page";
  }
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes === 0) return `${seconds} seconds`;
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ${seconds} seconds`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} hour${hours > 1 ? "s" : ""} ${mins} minute${mins > 1 ? "s" : ""}`;
}