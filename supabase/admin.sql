-- Admin dashboard view: one row per site with current status and 7-day stats.
-- Run once in the Supabase SQL editor. Safe to re-run.

create or replace view public.admin_site_status as
select
  s.id, s.url, s.name, s.owner_email, s.important_pages, s.added_at,
  lc.checked_at            as last_checked_at,
  lc.homepage_ok           as last_homepage_ok,
  lc.pages_checked         as last_pages_checked,
  lc.pages_broken          as last_pages_broken,
  lc.pages_slow            as last_pages_slow,
  lc.homepage_response_ms  as last_response_ms,
  u7.checks_7d, u7.ok_7d, u7.avg_response_ms_7d,
  s24.strip_24h,
  oi.open_incidents,
  i7.incidents_7d,
  sc.performance_score     as last_score,
  sc.checked_at            as last_score_at
from public.sites s
left join lateral (
  select * from public.uptime_checks uc
  where uc.site_id = s.id order by uc.checked_at desc limit 1
) lc on true
left join lateral (
  select count(*)                                   as checks_7d,
         count(*) filter (where uc.homepage_ok)     as ok_7d,
         round(avg(uc.homepage_response_ms))        as avg_response_ms_7d
  from public.uptime_checks uc
  where uc.site_id = s.id and uc.checked_at > now() - interval '7 days'
) u7 on true
left join lateral (
  -- last 24h of homepage checks as a string of 1 (up) / 0 (down), oldest first
  select string_agg(case when x.homepage_ok then '1' else '0' end, '' order by x.checked_at) as strip_24h
  from (
    select homepage_ok, checked_at from public.uptime_checks uc
    where uc.site_id = s.id and uc.checked_at > now() - interval '24 hours'
    order by uc.checked_at desc limit 300
  ) x
) s24 on true
left join lateral (
  select count(*) as open_incidents from public.incidents i
  where i.site_id = s.id and i.resolved_at is null
) oi on true
left join lateral (
  select count(*) as incidents_7d from public.incidents i
  where i.site_id = s.id and i.detected_at > now() - interval '7 days'
) i7 on true
left join lateral (
  select performance_score, checked_at from public.scores sc
  where sc.site_id = s.id order by sc.checked_at desc limit 1
) sc on true;

-- Only the service_role key (used by api/admin-data.js) may read this view.
revoke all on public.admin_site_status from anon, authenticated;
