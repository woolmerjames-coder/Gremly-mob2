# Today v3 Flags (Phase 10.9)

Add these to your `.env` (or Expo `extra`) to enable Today v3 scaffolding:

```bash
# Core Today v3 gate
EXPO_PUBLIC_TODAY_V3=on

# Feature slices for Today v3
EXPO_PUBLIC_TODAY_FOCUS_CARD=on
EXPO_PUBLIC_TODAY_DROP_ZONE=on
EXPO_PUBLIC_TODAY_SWEEP_PREVIEW=on

# Evening Sweep (minimal v1 flow; drawer + deck)
EXPO_PUBLIC_EVENING_SWEEP_V1=on
```

These are read via `lib/env.ts`:
- `env.feature.today.v3`
- `env.feature.today.focusCard`
- `env.feature.today.dropZone`
- `env.feature.today.sweepPreview`
- `env.feature.sweep.eveningV1`
