# Today v3 — Phase 3 Hooks

This phase introduces four hooks (no UI wiring yet):

- `useTodayEntries()`: merged habits+todos for “What’s on today” + (completed/remaining)
- `useFocusCard()`: get/set/clear focus for today; `autosuggest()` picks top candidate
- `useDropZoneSummary()`: count + lightweight theme quote from recent drops
- `useSweepPreview()`: “3 done · 2 to tidy” and `available` gating after 17:00

These rely on Phase 2 repo methods when available and gracefully fall back to v2 behaviors.

Feature flags:
- `env.feature.today.v3` gates auto-reload and summaries
- `env.feature.sweep.eveningV1` (or `env.feature.today.sweepPreview`) controls the evening preview availability
