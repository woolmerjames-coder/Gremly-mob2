-- One-off hotfix rollback: unarchive false calendar_deleted event notes
-- that were archived during the partial/stale provider fetch window.
-- Do not auto-apply; run manually.

UPDATE notes
SET archived = false,
    archived_reason = NULL,
    archived_at = NULL
WHERE subtype = 'event'
  AND external_source IS NOT NULL
  AND archived_reason = 'calendar_deleted'
  AND archived_at > '2026-04-21 04:00:00+00'
  AND archived_at < '2026-04-21 06:00:00+00';
