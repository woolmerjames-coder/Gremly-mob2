# Overlay V2 rollout notes — Phase 4 (brief)

Phase‑4 introduces a collapsible "Add details" panel on the Overlay V2. It contains:

- Person: select/link an existing person (Phase‑8 join behavior persists)
- Reminder: date/time reminder (optional)
- Space: select assignment (space_id)
- Formatting (notes/log only): fmt = plain | checkboxes | bullet

Save mapping (summary):

- Notes (log):
  - `fmt`: from explicit format control, or `checkboxes` when List tag is used
  - `mood`: set when Journal tag is present (defaults to `neu` if available)
  - `date`: set when a reminder is selected

- To‑dos:
  - `due_at`: from the todo due chip; falls back to reminder time when set

- Habits:
  - No new persisted schedule fields yet — schedule handled in a later phase

Person linking:

- Overlay will attempt to persist an explicit person selection using the repo linking helper (e.g. `repo.linkPersonToEntity` / existing join API)

Database / migrations:

- No new Supabase migrations are required for Phase‑4 — this phase uses existing columns/relations.

Host integration:

- Piping/host controller flows are untouched — OverlayHost and controller wiring remain the same; this is an additive UI/data refinement behind the feature flag.
 
Phase‑6: AI Prefill & Feedback (notes)

- Prefill suggestions from Cortex (title + tags).
- Low-confidence suggestions (confidence < 0.8) appear muted in the UI to indicate uncertainty.
- Feedback events are logged back to Cortex on user interactions:
  - If the user edits an AI-suggested title, a rejection event is recorded.
  - If the user accepts the suggestion (title unchanged on save), an acceptance event is recorded.
  - If the user unchecks a suggested tag, a tag-rejection event is recorded (sent once per suggested tag).
- This behavior is guarded by `EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL` (on|off). Default: `off`.

Implementation notes:

- The overlay calls a Cortex prefill/classify endpoint to get a suggested title and tags when opening in create mode with an empty body.
- Tags returned with low confidence (< 0.4) are ignored; tags between 0.4 and 0.8 are suggested but shown as low-confidence; tags >= 0.8 are suggested as confident.
- Feedback is sent to `cortex.feedbackOverlay` (if available) with payloads indicating type (`title` | `tags`), `accepted: boolean`, `prev`, and `newValue`.
- All Cortex calls are best-effort and defensive; the overlay falls back to no suggestions if Cortex is unavailable or the call errors.

# Unified Overlay V2 — Rollout Notes

Goal
----
Feature-flagged rollout for `UnifiedOverlayV2` so we can enable the new overlay iteratively without changing callers.

Flags
-----
- `EXPO_PUBLIC_FEATURE_OVERLAY_V2=on|off` — New V2 feature gate. Default: `off`.
- `EXPO_PUBLIC_UNIFIED_OVERLAY=on|off` — Existing flag controlling the current unified overlay (V1). Default: `on`.

Selection order
---------------
1. If `EXPO_PUBLIC_FEATURE_OVERLAY_V2=on` → render `UnifiedOverlayV2`.
2. Else if `EXPO_PUBLIC_UNIFIED_OVERLAY` is not set to `off` → render `UnifiedCreateOverlay` (V1).
3. Else → fall back to legacy `ManualAddOverlay`.

Callers & usage
----------------
- Import the single surface from `components/overlay/gateway` (exported as `OverlayComponent`).
- `components/OverlayHost.tsx` has been migrated to render the gateway.
- Other callers can be migrated to import from `components/overlay/gateway` or `components/overlay` index (future refactor).

Notes
-----
- The gateway ensures no behavioral change while switching branches of the implementation based on flags.
- For local development, add `EXPO_PUBLIC_FEATURE_OVERLAY_V2=off` to your `.env.local` or set to `on` to test V2.

Example `.env` entries
----------------------
EXPO_PUBLIC_FEATURE_OVERLAY_V2=off
EXPO_PUBLIC_UNIFIED_OVERLAY=on

Selection summary: V2 → V1 → ManualAdd
