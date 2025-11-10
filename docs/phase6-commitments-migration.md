# Phase 6 – Commitments Migration

## Overview
This migration adds commitment-tracking metadata to both `habits` and `todos`, enabling the app to store when a commitment started, attach an optional note, and archive the commitment state while enforcing a small active commitment cap.

## Added Columns
- **habits**
  - `commitment boolean DEFAULT false`
  - `commitment_started_at timestamptz NULL`
  - `commitment_note text NULL`
  - `commitment_archived_at timestamptz NULL`
- **todos**
  - `commitment boolean DEFAULT false`
  - `commitment_started_at timestamptz NULL`
  - `commitment_note text NULL`
  - `commitment_archived_at timestamptz NULL`

## New Indexes
- `idx_habits_commitment_owner` (`habits.owner_id`) WHERE `commitment = true`
- `idx_todos_commitment_owner` (`todos.owner_id`) WHERE `commitment = true`

## Rollback Steps
```sql
ALTER TABLE habits
  DROP COLUMN commitment,
  DROP COLUMN commitment_started_at,
  DROP COLUMN commitment_note,
  DROP COLUMN commitment_archived_at;

ALTER TABLE todos
  DROP COLUMN commitment,
  DROP COLUMN commitment_started_at,
  DROP COLUMN commitment_note,
  DROP COLUMN commitment_archived_at;
```

## Operational Notes
- The application enforces **a maximum of three active commitments per user** (combined across habits and todos). Ensure downstream services respect this constraint if the guardrails are bypassed.
