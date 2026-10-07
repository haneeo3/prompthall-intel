# PromptHall Monitor: Product Requirements Document

Version 1.0 · 7 October 2026 · Owner: Haneef Olajobi

## 1. Summary

PromptHall Monitor is a website monitoring service for Nigerian small businesses and the developers who build for them. It checks a website every 5 minutes, emails the owner in plain English within minutes when a page breaks, emails again when it is fixed, and sends a weekly report every Monday. Every email carries a technical section a developer can act on, so the owner only has to forward it.

## 2. Problem

Small-business websites in Nigeria go down often (expired domains, lapsed hosting, broken deploys, 404s on key pages) and the owner usually finds out from a customer, days later. Existing tools (UptimeRobot, Pingdom) are built for engineers: they say "HTTP 503" and nothing about what it costs the business or what to do.

## 3. Target users

| Persona | Need | How we serve it |
|---|---|---|
| Business owner (clinic, hotel, shop, school) | Know fast, understand it, get it fixed | Plain-English alerts with business impact, Request a fix |
| Web developer / agency with client sites | Look good to clients, catch issues before the client does | Developer box in every email, admin dashboard, one signup per client site |
| PromptHall admin (Haneef) | See every site, manage customers, prove the service works | Admin dashboard with uptime, incidents, add/edit/delete |

## 4. Goals and non-goals

Goals (pilot)
- Detect a confirmed outage and email the owner within 7 minutes.
- Zero false alarms from one-off hiccups (two failed checks 30 s apart required).
- One email per problem, one when resolved, one report per week. Nothing else.
- Every email understandable by a non-technical reader, and useful to a developer.
- The admin can see the whole fleet and know if the monitor itself is down.

Non-goals (pilot)
- WhatsApp / SMS alerts (planned paid feature).
- Alerts for slow-but-working pages (weekly report only).
- Customer login or self-serve dashboard.
- Payments.

## 5. Features

### 5.1 Live in the pilot
1. Signup page: URL, email, business name, important pages (tags). Instant first check.
2. Welcome email: what the pilot is, when they will hear from us, how to request a fix, how to stop.
3. First report email about one minute after signup.
4. Uptime check every 5 minutes: homepage, important pages, up to 10 crawled pages.
5. Confirm-before-alert: a page must fail twice, 30 s apart; must pass twice to resolve.
6. Incident lifecycle: open once, no repeats, close with duration.
7. Issue-detected and issue-resolved emails with business impact and developer details.
8. Weekly report, Mondays 8:00 WAT: score, change, outages, downtime, recommendations.
9. Stop-monitoring link in every email (signed, with confirmation page).
10. Admin dashboard: fleet status, 7-day uptime, incidents, per-site history, add/edit/delete.
11. Heartbeat: alerts the admin if the monitor stops running.
12. Welcome page explaining the pilot.

### 5.2 Next (priority order)
1. Domain and SSL certificate expiry warnings (30 / 7 / 1 days).
2. 24-hour "still down" reminder for open incidents.
3. Alert noise rule: only homepage and important pages alert immediately; crawled pages go to the weekly report.
4. Agency plan: many sites, client-branded reports.
5. WhatsApp alerts (Twilio) on the paid plan; Telegram as a free option.
6. Paid plans via Paystack.

## 6. User stories

- As an owner, when my booking page breaks I get one email that tells me customers cannot book, so I call my developer immediately.
- As an owner, I can forward the email to my developer and they can fix it without asking me anything.
- As an owner, I can stop the service with one click.
- As a developer, I get the status code, error type, server header, response time and a curl command.
- As the admin, I can see which sites are down right now and how long they have been down.
- As the admin, I can add a client's site and the owner receives the welcome and first report as if they signed up themselves.

## 7. Success metrics (pilot)

| Metric | Target |
|---|---|
| Time from outage to alert email | under 7 minutes, 95th percentile |
| False alarms | 0 per site per month |
| Duplicate alerts for one outage | 0 |
| Monitor uptime (runs every 5 min) | 99% of expected runs |
| Owners who reply or forward an alert | 30% of alerted owners |
| Spam complaints | 0 |

## 8. Pricing hypothesis (to validate)

- Owner plan: NGN 3,000 to 5,000 per site per month, WhatsApp alerts included.
- Agency plan: NGN 15,000 to 30,000 per month for up to 20 sites, branded reports.
- Fix-it tier: monitoring plus a partner developer on call, from NGN 30,000 per month.

## 9. Risks

- Email deliverability: without an unsubscribe path and clean sending, Gmail may mark all PromptHall mail as spam. Mitigated by the cancel link, SPF/DKIM/DMARC, and low volume.
- Scheduler reliability: GitHub's cron is best-effort. Mitigated by cron-job.org as the clock and healthchecks.io as the watchdog.
- Data growth: 288 checks per site per day. Needs a retention job (see TRD).
- Trust: a single false alarm costs credibility. Confirm-before-alert is non-negotiable.
