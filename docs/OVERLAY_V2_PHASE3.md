Phase 3 — Unified Overlay V2 (brief)
-----------------------------------

- Tag chips: Journal, List (visible in V2 header). These are lightweight client-side flags stored in the overlay reducer.
- Journal shows a mood row in the UI; mood is saved into the note payload as `mood` (e.g., `mood: 'pos'|'neu'|'neg'`).
- List shows inline checkboxes in the editor; saved notes with list content include `fmt: 'checkboxes'` so the renderer can display native checkboxes.
- Mentions/date chips are surfaced from lightweight inline detection; tapping a date chip opens the existing date-picker flow and sets `todo.due_at`.
- No Supabase schema changes required for Phase‑3; existing save piping and repo calls are preserved.
