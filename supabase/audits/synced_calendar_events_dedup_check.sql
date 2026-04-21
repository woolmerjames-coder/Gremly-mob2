-- Expected: 0 rows. If any appear, we have a dedup bug.
select owner_id, external_id, provider, count(*)
from synced_calendar_events
group by owner_id, external_id, provider
having count(*) > 1
order by count(*) desc
limit 50;
