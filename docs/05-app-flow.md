# PromptHall Monitor: App Flow

Version 1.0 · 7 October 2026 · All times WAT

## Flow 1: Owner signs up

1. Owner opens `prompthall-intel.vercel.app` (from prompthall.space or a link).
2. Enters website address, email, business name (optional), important pages as tags (optional). Address without `https://` is accepted.
3. Clicks "Start monitoring". Progress screen: Saving your site -> Running Google PageSpeed test -> Visiting your pages -> Writing your first report. Elapsed seconds shown; bar waits for the server.
4. Result screen: big score with word (fast / could be faster / slow), "report is on its way to {email}", buttons: Add another site, What the pilot includes.
5. Inbox: (a) "Welcome to PromptHall, we're now watching {site}" immediately; (b) "{site}: your first PromptHall report (NN/100)" about a minute later.
6. If the same address + email is submitted again: site is updated, no duplicate, no second welcome email, fresh first report.

Errors: invalid address or email are caught on the page before submitting; server errors show a red line under the form and the progress screen closes.

## Flow 2: A page breaks

1. 5-minute check finds the page failing (status null, 4xx, 5xx).
2. 30 seconds later a second check fails. Page is confirmed down.
3. Incident row created. Owner receives "Issue detected on {site}": what broke in plain English, what it means for the business, what to do, developer box, "we'll email you when it's resolved". Within about 5 to 7 minutes of the outage starting.
4. Subsequent runs see the open incident and stay silent.
5. Page passes a check, then passes the 30-second re-check. Incident closed with duration.
6. Owner receives "Issue resolved on {site}": how long it was down, down-since / back-up times, no action needed.

Admin view: the site row turns red (DOWN) with an open-incident pill; the 24-hour strip shows red ticks; the detail panel lists the incident; everything returns to green after resolution.

## Flow 3: Monday report

1. 07:00 UTC (08:00 WAT): PageSpeed and 20-page crawl for every site, score saved.
2. Owner receives "{site}: weekly report (NN/100)" or "{site} needs attention this week": score and change, trend, outages of the week with durations and total downtime, recommendations, developer box with metrics and incidents, PageSpeed link.
3. No other emails between Mondays unless something breaks.

## Flow 4: Owner requests a fix

1. From any email: reply, or click "request a fix" (footer) / "Request a fix" button (welcome). Opens an email to the fix address with subject "Please fix my website: {url}" and a prefilled body.
2. Haneef (or a partner developer) replies with a quote; the developer box in the alert is the brief.

## Flow 5: Owner stops monitoring

1. Clicks "Stop monitoring this site" in any email footer.
2. Confirmation page: what will be removed and that emails stop; "Yes, stop monitoring" / "No, keep it".
3. On confirm: site and all its data deleted; "Monitoring stopped" page; link to add it again.
4. An invalid or tampered link shows "This link isn't valid"; a reused link shows "Already stopped".

## Flow 6: Admin manages the fleet

1. Opens `/admin.html`; enters the admin password once (stored in the browser).
2. Sees cards: sites, up now, down now, open incidents, 7-day uptime, owners, monitor last ran.
3. Table: status, site, owner, uptime 7d, 24h strip, response, broken pages, incidents, score, last check. Search, filter (down / incidents / stale), sort.
4. Click a site: status, uptime, 24h response chart, pages from the last check, PageSpeed history, incident history. Buttons: Edit, Delete, Close.
5. "+ Add site": address, owner email, name, important pages. Save runs the full onboarding (owner gets welcome + first report).
6. Edit: same form pre-filled; Delete: confirmation listing what is removed.
7. Page refreshes itself every minute; "Monitor last ran" turns red if no run in 15 minutes.

## Flow 7: Monitor stops running (ops)

1. cron-job.org fails to trigger (token expired, outage) or the run crashes.
2. healthchecks.io gets no ping for 15 minutes (or a /fail ping immediately) and emails Haneef.
3. Dashboard card is red. Check cron-job.org history, then GitHub Actions logs, then GitHub secrets.

## Flow 8: Team test day

1. Haneef commits `team-test.html`; team signs up with the test site and `/team-test.html` as an important page.
2. 11:00 Haneef deletes the page; team receives "Issue detected" by 11:10; no second email by 11:40.
3. 11:30 Haneef restores it; team receives "Issue resolved" by 11:40.
4. Next day: no emails. Team reports Good/Bad per step with screenshots and times.
