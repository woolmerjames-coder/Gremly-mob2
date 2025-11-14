# Phase 5 — Commitments (notes)

Phase‑5 introduces a lightweight commitments feature for To‑Dos and Habits. This phase is intentionally small: it adds a toggle and a short optional note in the overlay, persists a minimal set of fields, and enforces a soft limit where the repo exposes that information.

Key behaviors
- Commitment toggle: available when creating/editing To‑Dos and Habits. When enabled, a small optional note (up to ~140 characters) can be entered.
- Soft limit: the UI will attempt a best‑effort check against the repo to enforce a soft limit of 3 active commitments. If the repo exposes a counting or listing API (for example `repo.countActiveCommitments()` or `repo.listCommitments()`), the overlay will query it and prevent enabling a new commitment when the soft limit is reached. If the repo does not provide such an API shape, the overlay falls back to permissive behavior and allows enabling commitments.

Persisted payload (todo/habit only)
- `commitment` (boolean) — whether the item is marked as a commitment
- `commitment_note` (string | null) — optional short note entered with the toggle (trimmed to ~140 chars)
- `commitment_started_at` (ISO timestamp | null) — set when the commitment is enabled (only set on enable; preserved on subsequent edits)

Database/migrations
- No Supabase migration is included in this change. This rollout assumes the backend already supports these fields per the project brief. If fields are missing in the target backend, a follow‑up migration will be required before enabling the flag in production.

UX notes
- The commitment control is feature‑flagged and gated behind `EXPO_PUBLIC_FEATURE_COMMITMENTS`.
- The soft‑limit check is best‑effort only — failures or missing repo methods will not block saves; they only affect whether the toggle can be enabled in the UI.
