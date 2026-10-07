# PromptHall Monitor: Implementation Plan

Version 1.0 · 7 October 2026 · Times are WAT

## Phase 0: Foundation (done, 3 to 5 Oct)

| # | Task | Status |
|---|---|---|
| 0.1 | Fix weekly cron that never fired; dedupe check logic; README | Done |
| 0.2 | Create `uptime_checks` and `incidents` tables (`supabase/schema.sql`) | Done |
| 0.3 | 5-minute uptime monitor with confirm-before-alert, parallel sites, heartbeat | Done |
| 0.4 | Incident manager: no alert unless incident saved | Done |
| 0.5 | Alerts with business impact and developer details | Done |
| 0.6 | Weekly report with outages and total downtime | Done |
| 0.7 | cron-job.org as the clock; GitHub token; concurrency guard | Done |
| 0.8 | healthchecks.io heartbeat | Done |
| 0.9 | Admin dashboard (view, API, page) with CRUD | Done |
| 0.10 | Signup page v2, tag input, progress screen; welcome page | Done |
| 0.11 | Welcome email, shared onboarding, signed cancel link | Done |
| 0.12 | Premium email layout with logo; em dashes removed | Done |
| 0.13 | Data cleanup and local backup; 60-lead prospect list | Done |

## Phase 1: Pilot readiness (this week)

| # | Task | Est. | Notes |
|---|---|---|---|
| 1.1 | Team test day using `team-test.html` (break at 11:00, fix at 11:30) | 1 day | Message drafted; needs test page committed |
| 1.2 | Verify Resend domain: SPF, DKIM, DMARC all green | 15 min | Haneef |
| 1.3 | Data retention job: delete `uptime_checks` > 30 days, weekly | 1 h | Add to Monday workflow |
| 1.4 | 24-hour "still down" reminder email | 2 h | One reminder only |
| 1.5 | Alert noise rule: crawled pages do not alert, only homepage + important pages | 1 h | Flag on page results |
| 1.6 | Pilot outreach: 60-lead list, two email templates (owner, agency) | 2 h | Follow NDPA: identify, purpose, opt-out |
| 1.7 | Calendar reminder: GitHub token expiry Sept 2027 | 2 min | |

## Phase 2: Product depth (weeks 2 to 4)

| # | Task | Est. |
|---|---|---|
| 2.1 | Domain expiry check (WHOIS/RDAP) with 30/7/1-day warnings | 1 day |
| 2.2 | SSL certificate expiry check with warnings | 0.5 day |
| 2.3 | Weekly report: business-hours downtime and estimated visitors affected | 1 day |
| 2.4 | Multiple recipients per site (owner + developer email) | 0.5 day |
| 2.5 | Public status page per site (`/status/<slug>`) | 2 days |
| 2.6 | Admin: pause/resume alerts per site, notes field | 0.5 day |

## Phase 3: Monetisation (month 2)

| # | Task | Est. |
|---|---|---|
| 3.1 | Meta business verification + WhatsApp templates (start early, slow) | 1 to 2 weeks elapsed |
| 3.2 | WhatsApp alerts via Twilio, pluggable channel (Telegram free fallback) | 2 days |
| 3.3 | Plans table, Paystack checkout, plan gates (interval, channels, sites) | 3 days |
| 3.4 | Agency plan: client-branded weekly report, agency dashboard | 3 days |
| 3.5 | Fix-it tier: partner developer routing with the developer box pre-filled | 2 days + partners |

## Operating rhythm

- Daily: glance at the dashboard (down now, monitor last ran).
- Monday 8:10: check Resend for bounces after the weekly send.
- Weekly: read every reply to alerts; log confused sentences and fix wording.
- Monthly: review `uptime_checks` size; rotate nothing unless expiring.

## Definition of done for the pilot

- 20 real sites monitored for 30 days.
- 95% of confirmed outages alerted within 7 minutes; zero false alarms reported.
- At least 5 owner conversations about what they would pay for.
