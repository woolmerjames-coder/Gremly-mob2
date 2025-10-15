# Phase 1 — Scaffold & Navigation QA Checklist

## Visual
- [ ] Bottom tab bar visible: Today | Hub | Spaces | Me
- [ ] Light mode uses `bg` (Cream); dark uses black
- [ ] Each tab shows its header text

## Interactions
- [ ] Switch between tabs smoothly
- [ ] Today → "Open Demo Sheet" opens sheet
- [ ] Sheet Close button dismisses sheet

## Dev Checks
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (Node-only sanity)
- [ ] `babel.config.js` has `react-native-reanimated/plugin` last

Notes:
- Wrappers required at root: GestureHandlerRootView → SafeAreaProvider → SheetProvider → ThemeProvider → NavigationContainer
