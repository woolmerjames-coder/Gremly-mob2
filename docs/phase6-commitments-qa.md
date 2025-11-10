# Phase 6 QA - Commitments

## Functional
- [ ] Toggle "Commitment" on habit: appears in Today "Commitments" section.
- [ ] Max 3 enforcement: 4th toggle blocked with user feedback.
- [ ] Uncommit removes from Today section immediately.
- [ ] Commitment note saved and rendered truncated.
- [ ] Reflection stub logs when a commitment missed in Sweep scenario (simulate).

## Non-Functional
- [ ] countActiveCommitments cached (no >2 sequential round-trips when toggling quickly).
- [ ] No DB errors on migration in Supabase logs.
- [ ] Tests pass: memory + UI.

## Edge
- [ ] Unassign space does not affect commitment state.
- [ ] Archived item auto-treated as not active commitment (not shown).
- [ ] Editing commitment note does not duplicate cards.
