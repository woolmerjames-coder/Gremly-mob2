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

## Styling with NativeWind

- Use `className` on React Native primitives (View, Text, Pressable, etc.).
- When changing Tailwind or Babel configs, clear the Metro cache:
  ```bash
  npx expo start -c
  ```
- Tokens: Tailwind brand colors are defined in `tailwind.config.js` under `theme.extend.colors` (deepTeal, mint, cream, periwinkle). Add more there and restart with a clean cache. Rounded sizes include `rounded-2xl` (24).
- Content globs: update `tailwind.config.js` `content` when adding new folders so classes are not purged (currently: `App`, `app/**`, `components/**`, `lib/**`).
- Babel: `'react-native-reanimated/plugin'` must remain LAST in the `plugins` array; `'nativewind/babel'` is included as well.

Example snippet:

```tsx
export function StyleCheck() {
  return (
    <View className="p-4">
      <View className="h-12 w-24 bg-deepTeal rounded-2xl" />
      <Text className="text-deepTeal-900 font-semibold mt-2">ClassName is active</Text>
    </View>
  );
}
```

