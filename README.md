# Gremly-mob2

Expo React Native + TypeScript app for habit tracking and personal productivity.

## Quick Start (Phase 1)
```bash
npm install
npm run lint
npm run typecheck
npm test
npx expo start -c
```

### Troubleshooting
- **Reanimated error** → ensure `babel.config.js` has `'react-native-reanimated/plugin'` last.
- **Demo sheet not opening** → confirm root wrappers:
  `GestureHandlerRootView → SafeAreaProvider → SheetProvider → ThemeProvider → NavigationContainer`.
