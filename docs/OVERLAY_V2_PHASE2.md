Phase 2 — Unified Overlay V2 (brief)
-----------------------------------

- Non-destructive type switching implemented: a single TextInput is preserved while per-type fields are stored in a reducer-backed state (log/todo/habit buckets).
- Saved payloads map to V1 expectations per type (notes → note, todo → todo, habit → habit) using a non-destructive mapper.
- Minimal per-type parity controls added: a tiny due-date inline chip for To‑Do that opens a lightweight date modal and stores to `state.todo.due_at`. Habit schedule is retained in state for later UI work.
- No Supabase schema or backend changes are required for Phase‑2.
