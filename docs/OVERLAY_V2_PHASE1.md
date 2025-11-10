# Overlay V2 — Phase‑1 Checklist & Alignment

Summary
-------
Phase‑1 delivers a constrained, safe V2 surface (Level‑1) behind the `EXPO_PUBLIC_FEATURE_OVERLAY_V2` flag. The goal is to validate core behaviors and rollout ergonomics without changing callers or global event wiring.

What Phase‑1 includes
---------------------
- Level‑1 UI shell for `UnifiedOverlayV2` (header, type pills, multiline text area, fixed save bar).
- Local draft autosave (AsyncStorage) with a 400ms debounce; drafts cleared on Save or Cancel.
- Gateway wiring and `OverlayHost` integration so toggling the flag switches implementations at runtime.
- Core unit tests for gateway and V2 core behaviors (save enabling, title derivation) added under `tests/overlay`.
- Brand token-driven spacing/contrast adjustments for Level‑1 (no motion/polish yet).

Acceptance checklist (merge criteria)
-----------------------------------
1. All gateway and V2 core tests pass locally and in CI.
2. Pre-commit hooks (lint/format) pass for changed files.
3. No behavioral change for callers when V2 flag is off (smoke test via `OverlayHost`).
4. Draft persistence works: write/read/clear verified manually or via unit tests.
5. Analytics and global `overlaySaved` emission remain centralized in `OverlayHost`.

Risks / Known gaps
------------------
- Some TypeScript `any` casts remain in V2 for Phase‑1 parity (marked TODO — to be tightened in Phase‑2).
- Additional unit tests (autosave clearing, payload assertions) are recommended for Phase‑2.
- Visual polish, motion, and accessibility QA will happen later (Phase‑3+). Current style focuses on spacing and contrast only.

Rollout plan
------------
1. Merge branch behind feature flag with docs and tests.
2. Enable `EXPO_PUBLIC_FEATURE_OVERLAY_V2=on` for a small internal cohort (dev/staging) and validate behavior.
3. Monitor error logs and overlay save/create metrics for a few days.
4. Gradually widen rollout if stable; tighten types and add more tests in parallel.
5. If critical regressions occur, flip `EXPO_PUBLIC_FEATURE_OVERLAY_V2=off` to restore V1 immediately.

Owner / Contacts
----------------
Overlay owners: frontend team (primary), product/design (review).
