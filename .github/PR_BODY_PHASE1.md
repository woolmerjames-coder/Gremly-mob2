## feat(nav): scaffold tabs + ThemeProvider + OverlayHost

### What changed
- Bottom tabs (Today, Hub, Spaces, Me)
- Global OverlayHost (actions-sheet) + demo sheet
- ThemeProvider using Tailwind tokens (bg for light, black for dark)

### Screenshots
- [ ] Tabs visible
- [ ] Demo sheet open

### QA (tick all)
- [ ] App boots (iOS sim)
- [ ] Tabs switch
- [ ] Today → Demo sheet opens/closes
- [ ] `npm run lint` ✅
- [ ] `npm run typecheck` ✅
- [ ] `npm test` ✅

### Notes
- `react-native-reanimated/plugin` is last in `babel.config.js`
- Root wrappers: `GestureHandlerRootView → SafeAreaProvider → SheetProvider → ThemeProvider → NavigationContainer`
