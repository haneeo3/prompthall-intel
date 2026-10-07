# PromptHall Monitor: System Design

Version 1.0 · 7 October 2026

## 1. Module map

```
site-utils.js        normaliseSiteUrl, normaliseImportantPages, normaliseEmail
links.js             APP_URL, FROM, cancelToken/verify, cancelUrl, fixMailto, esc
email-layout.js      layout(), h1/p/small/label/strong/link, button, panel, pill, techTable, devBox, BRAND
welcome-mailer.js    renderWelcomeHtml, sendWelcomeEmail
alert-mailer.js      renderIssueAlertHtml, renderRecoveryAlertHtml, sendIssueAlert, sendRecoveryAlert
email-template.js    renderEmailHtml (first + weekly report)
digest-summary.js    getScoreHistory, getRecentIncidents, buildSummary, formatDuration
site-checker.js      checkSite(url): PageSpeed + crawl -> scores row
site-crawler.js      crawlAndCheckSite(url): discover up to 20 pages, status + timing
onboard-site.js      onboardSite(supabase, site, {isUpdate}): welcome -> first check -> first report
uptime-monitor.js    main 5-minute job
incident-manager.js  processCheckResults(site, results)
check-all-sites.js   weekly PageSpeed for all sites
send-digest.js       weekly email for all sites
api/add-site.js      POST signup
api/admin-data.js    GET/POST/PATCH/DELETE admin
api/cancel.js        GET confirm / POST delete
```

## 2. Uptime run (every 5 minutes)

```
start -> heartbeat /start
load sites (id, url, name, owner_email, important_pages)
for each site, 8 at a time:
   discoverPages(homepage)            up to 10 same-host links
   openIncidentUrls(site)             pages with resolved_at IS NULL
   urls = [homepage, important..., crawled...] (unique)
   first = checkBatch(urls)           5 at a time, 10 s timeout each
   recheck = pages that failed OR have an open incident
   if recheck not empty: wait 30 s, second = checkBatch(recheck)
   merge:  fail+fail -> down (confirmed)   pass+pass -> up
           mixed     -> keep current state, mark flaky
   insert uptime_checks row (counts, homepage_ok, response ms, results_json)
   processCheckResults(site, results)
done -> heartbeat (success)    |   crash or all sites failed -> heartbeat /fail, exit 1
```

Per-page result shape: `{ url, ok, status, responseTimeMs, slow, checkedAt, finalUrl?, errorType?, errorCode?, error?, server?, contentType?, bodySnippet?, confirmed?, flaky? }`. `errorType` is one of `dns | tls | timeout | connection_refused | connection_reset | network | http_4xx | http_5xx | http_other`.

## 3. Incident state machine

```
             page !ok and no open incident
   (none) ------------------------------------> OPEN   [insert incident; if insert fails: no email]
                                                  |      send "Issue detected" (once)
   page !ok and incident open: do nothing         |
                                                  v
   page ok and incident open  -----------------> RESOLVED [update resolved_at; if update fails: no email]
                                                           send "Issue resolved" with duration
```

Incident row stores: page_url, type, severity, description, recommendation, status_code, error_type, response_time_ms, technical_details (JSON: checked_at, final_url, error, error_code, server, content_type, body_snippet, checks_failed), detected_at, resolved_at.

## 4. Signup and onboarding

```
POST /api/add-site {url, email, name, important_pages[]}
  normalise url + email; filter pages to same host (max 10)
  existing = sites where url = X and owner_email ilike Y
  existing ? update : insert
  onboardSite(site, {isUpdate})
     if !isUpdate: sendWelcomeEmail
     result = checkSite(url)        PageSpeed + crawl (20 to 45 s)
     insert scores row
     send first report (renderEmailHtml with isFirstReport)
  -> 200 {ok, score, updated}
```
The admin `POST /api/admin-data` runs the same `onboardSite`, so admin-added sites behave identically. Function timeout 60 s on both.

## 5. Weekly job (Monday 07:00 UTC)

`check-all-sites.js`: for each site, `checkSite` -> scores row. Then `send-digest.js`: history (8 latest scores) + incidents from the last 7 days -> `buildSummary` -> `renderEmailHtml`. Subject depends on first report / regression / normal.

## 6. Admin API

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/admin-data` | | `{generatedAt, sites: admin_site_status[]}` |
| GET | `/api/admin-data?site=id` | | `{site, pages, lastCheckedAt, checks(7d), incidents(100), scores(12)}` |
| POST | `/api/admin-data` | `{url, owner_email, name?, important_pages?}` | `201 {site, score, onboardError}` |
| PATCH | `/api/admin-data?site=id` | any subset | `{site}` |
| DELETE | `/api/admin-data?site=id` | | `{ok}`; deletes incidents, uptime_checks, scores, then site |
All require `Authorization: Bearer ADMIN_TOKEN`. Validation errors return 400.

## 7. Cancel flow

`GET /api/cancel?site=id&token=hmac` -> verify -> confirmation page (or "already stopped"). `POST` same query -> delete children, delete site -> "Monitoring stopped" page. Token = HMAC-SHA256(secret, `cancel:<id>`)[0:32].

## 8. Scheduling

cron-job.org POSTs `workflow_dispatch` every 5 min with `inputs.job=uptime`. GitHub cron `*/5` is a backup; `0 7 * * 1` runs the weekly job. Concurrency group `prompthall-monitor-<schedule or job>` queues overlapping runs.

## 9. Failure handling summary

| Failure | Behaviour |
|---|---|
| One site throws | Logged, run continues |
| All sites fail | Exit 1, heartbeat /fail |
| Incident insert fails | No email, retried next run |
| Resend error | Logged; alert not retried (known gap) |
| Supabase down | Run crashes, heartbeat /fail, admin alerted |
| cron-job.org down | GitHub cron continues (best effort); dashboard card turns red after 15 min |
| Scheduler + GitHub both silent | healthchecks.io alerts after 15 min |
