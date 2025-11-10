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
