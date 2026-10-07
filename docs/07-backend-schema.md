# PromptHall Monitor: Backend Schema

Version 1.0 · 7 October 2026 · Supabase (Postgres). SQL in `supabase/schema.sql` and `supabase/admin.sql`.

## Relationships

```
sites 1 ---< scores            (weekly + first-check PageSpeed results)
sites 1 ---< uptime_checks     (one row per site per 5-minute run)
sites 1 ---< incidents         (one row per outage of one page)
admin_site_status  = view over all four, one row per site
```
Deleting a site cascades to `uptime_checks` and `incidents` (FK `on delete cascade`). `scores` is deleted explicitly by the API before the site (older table, cascade not guaranteed).

## sites

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| url | text | Normalised: lowercase host, no trailing slash on bare domains |
| name | text null | Business name |
| owner_email | text null | Lowercased; alerts go here |
| important_pages | jsonb null | Array of absolute URLs on the same host, max 10 |
| contact_url, whatsapp_number | text null | Legacy, unused |
| added_at | timestamptz | |

Uniqueness is enforced in the signup API (url + owner_email, case-insensitive), not by a constraint.

## scores

| Column | Type | Notes |
|---|---|---|
| id | PK | |
| site_id | uuid FK sites | |
| checked_at | timestamptz | |
| performance_score | int | 0 to 100, mobile |
| lcp, cls, tbt | text | Display values from Lighthouse |
| raw_json | jsonb | Full PageSpeed payload (large; excluded from exports) |
| pages_checked, pages_broken_count, pages_slow_count | int | From the 20-page crawl |
| pages_report | jsonb | Per-page crawl results |

## uptime_checks

| Column | Type | Notes |
|---|---|---|
| id | bigint identity PK | |
| site_id | uuid FK sites, cascade | |
| checked_at | timestamptz default now() | |
| pages_checked, pages_broken, pages_slow | int | |
| homepage_ok | bool | Drives uptime % and the 24h strip |
| homepage_response_ms | int null | |
| results_json | jsonb | Per-page results incl. errorType, confirmed, flaky |
| created_at | timestamptz | |

Index: `(site_id, checked_at desc)`. Growth about 288 rows per site per day. Retention job pending (30 days).

## incidents

| Column | Type | Notes |
|---|---|---|
| id | bigint identity PK | |
| site_id | uuid FK sites, cascade | |
| page_url | text | |
| type | text | downtime, server_error, page_error, performance, unknown |
| severity | text | critical (no response) or warning |
| description, recommendation | text | Plain-English copy used in the email |
| status_code | int null | |
| error_type | text null | dns, tls, timeout, connection_refused, connection_reset, network, http_4xx, http_5xx |
| response_time_ms | int null | |
| technical_details | jsonb null | checked_at, final_url, error, error_code, server, content_type, body_snippet, checks_failed |
| detected_at | timestamptz default now() | |
| resolved_at | timestamptz null | NULL means open |
| created_at | timestamptz | |

Partial index: `(site_id, page_url) where resolved_at is null` for the "is there an open incident" lookup.

## admin_site_status (view)

One row per site: site columns plus `last_checked_at, last_homepage_ok, last_pages_checked, last_pages_broken, last_pages_slow, last_response_ms, checks_7d, ok_7d, avg_response_ms_7d, strip_24h (string of 1/0, oldest first, up to 300), open_incidents, incidents_7d, last_score, last_score_at`. `revoke all from anon, authenticated`; readable only with the service-role key.

## Security

- RLS enabled on `uptime_checks` and `incidents` with no policies: only the service-role key can read or write.
- The browser never holds a Supabase key; all access goes through Vercel functions.

## Pending changes

- Retention: weekly delete of `uptime_checks` older than 30 days.
- `sites.alerts_paused_at timestamptz null` for admin pause/resume.
- `sites.dev_email text null` for a second recipient.
- `domain_checks` table for domain and SSL expiry (Phase 2).
