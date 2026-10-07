# PromptHall Monitor: Technical Requirements Document

Version 1.0 · 7 October 2026

## 1. Architecture at a glance

```
 Owner's browser                 cron-job.org (every 5 min)        healthchecks.io
   | signup form                       | POST workflow_dispatch          ^ ping
   v                                   v                                 |
 Vercel (static pages + serverless)  GitHub Actions runner  -----> uptime-monitor.js
   index.html, welcome.html,           (ubuntu, node 22)              incident-manager.js
   admin.html, assets/                                                 alert-mailer.js
   api/add-site.js                     Monday 07:00 UTC job:              |
   api/admin-data.js                   check-all-sites.js                 |
   api/cancel.js                       send-digest.js                     |
        |                                   |                             |
        v                                   v                             v
                       Supabase (Postgres): sites, scores, uptime_checks, incidents, admin_site_status view
                                            |
                                            v
                                   Resend (email) from monitor@prompthall.space
                                   Google PageSpeed Insights API (weekly + first check)
```

## 2. Components

| Component | Runs on | Trigger | Responsibility |
|---|---|---|---|
| `index.html` | Vercel static | user | Signup, tag input, progress screen |
| `welcome.html` | Vercel static | user | Pilot explanation |
| `admin.html` | Vercel static | admin | Fleet dashboard, CRUD |
| `api/add-site.js` | Vercel function (60 s) | POST | Validate, save, onboard |
| `api/admin-data.js` | Vercel function (60 s) | GET/POST/PATCH/DELETE | Dashboard data and CRUD, token-protected |
| `api/cancel.js` | Vercel function | GET/POST | Signed stop-monitoring flow |
| `uptime-monitor.js` | GitHub Actions | every 5 min | Check all sites, confirm, record, hand to incident manager |
| `incident-manager.js` | (called by monitor) | | Open/close incidents, trigger alerts |
| `check-all-sites.js` + `send-digest.js` | GitHub Actions | Mon 07:00 UTC | PageSpeed + crawl, weekly email |
| `onboard-site.js` | (shared) | signup / admin add | Welcome email, first check, first report |
| `email-layout.js` and mailers | (shared) | | All email rendering |
| `site-utils.js`, `links.js` | (shared) | | Validation, signed links, footer |

## 3. Stack

Node.js 22 (ES modules), Supabase (Postgres, service-role key server-side only), Resend, Cheerio, Google PageSpeed Insights v5, Vercel (Hobby), GitHub Actions, cron-job.org, healthchecks.io. No frontend framework; plain HTML/CSS/JS.

## 4. Environment variables

| Name | Where | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel, GitHub secrets, local .env | Database (bypasses RLS; never in the browser) |
| `RESEND_API_KEY` | Vercel, GitHub secrets | Email |
| `PAGESPEED_API_KEY` | GitHub secrets, Vercel | PageSpeed quota |
| `ADMIN_TOKEN` | Vercel | Dashboard password (Bearer) |
| `HEARTBEAT_URL` | GitHub secrets | healthchecks.io ping |
| `DIGEST_TO_EMAIL` | GitHub secrets | Fallback digest recipient |
| `APP_URL` | optional | Base for links in emails (default prompthall-intel.vercel.app) |
| `FIX_EMAIL` | optional | Request-a-fix address (default prompthall@gmail.com) |
| `CANCEL_SECRET` | optional | HMAC key for cancel links (falls back to service key) |

## 5. Scheduling and reliability requirements

- R1. Uptime check must start within 60 s of each 5-minute mark. Achieved by cron-job.org calling GitHub's `workflow_dispatch` API with `{"ref":"main","inputs":{"job":"uptime"}}`; GitHub's own `*/5` cron is a backup.
- R2. Two runs of the same job must never overlap: GitHub `concurrency` group per job, `cancel-in-progress: false`.
- R3. A page is down only after two failed checks 30 s apart; up only after two passes. Mixed results change nothing.
- R4. A site that errors must not stop the run (per-site try/catch). If every site fails, the run exits non-zero and pings `HEARTBEAT_URL/fail`.
- R5. Each run pings `HEARTBEAT_URL/start`, then `HEARTBEAT_URL` on success. healthchecks.io: period 5 min, grace 10 min.
- R6. If an incident cannot be written to the database, no alert is sent (prevents repeat emails).
- R7. Manual workflow runs default to the uptime job only; the weekly digest never runs by accident.
- R8. Per-page timeout 10 s; slow threshold 3 s; 5 pages in parallel per site; 8 sites in parallel.
- R9. GitHub fine-grained token for cron-job.org expires 2 October 2027 and must be rotated before then.

## 6. Security requirements

- Service-role key only in server environments. Public signup page talks only to `/api/add-site`.
- `admin_site_status` view: `revoke all from anon, authenticated`. New tables have RLS enabled with no policies.
- Admin API: constant-time Bearer comparison; `Cache-Control: no-store`.
- Cancel links: HMAC-SHA256(site id) truncated to 32 hex chars; GET shows a confirmation, only POST deletes.
- Push protection on the GitHub repo; `.env`, `backups/`, `previews/` are gitignored.
- Customer data (emails) must never be committed. Local backups are deleted when no longer needed.

## 7. Email requirements

- From: `PromptHall <monitor@prompthall.space>` (domain verified in Resend; SPF, DKIM, DMARC).
- Every email: logo, plain-English top, developer section where relevant, footer with request-a-fix and stop-monitoring links.
- Preheader text set on every template.
- No em dashes in customer-facing text.
- Subjects: `Welcome to PromptHall, we're now watching {site}`, `{site}: your first PromptHall report (NN/100)`, `Issue detected on {site}`, `Issue resolved on {site}`, `{site}: weekly report (NN/100)`, `{site} needs attention this week`.

## 8. Data retention (to implement)

`uptime_checks` grows by ~288 rows per site per day. Requirement: a weekly job deletes `uptime_checks` older than 30 days and `scores` older than 1 year; `incidents` are kept indefinitely. Supabase free tier is 500 MB.

## 9. Performance limits

- Signup function: 60 s max (PageSpeed usually 20 to 45 s).
- PageSpeed free quota: 25,000 requests/day; used once per site per week plus once per signup.
- Dashboard summary: one query against the view; detail: five parallel queries, 7 days of checks capped at 2,500 rows.

## 10. Observability

- GitHub Actions logs per run (site-prefixed lines).
- healthchecks.io for liveness; cron-job.org failure notifications for the trigger.
- Admin dashboard "Monitor last ran" card turns red after 15 minutes without a run.
- Resend dashboard for bounces and complaints.
