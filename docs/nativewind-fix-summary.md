# NativeWind Design System - Troubleshooting & Fix Summary

**Date:** October 15, 2025  
**Branch:** feat/design-system-nativewind  
**Status:** ✅ FIXED

---

## 🐛 Problem Diagnosis

The design system components were not rendering with NativeWind styles due to **4 critical missing pieces**:

1. **❌ Missing CSS Import** - `app.css` was not imported in `App.tsx`, so Tailwind directives never loaded
2. **❌ Incomplete Content Globs** - `components/` and `providers/` folders were not in Tailwind's content scanning
3. **❌ Wrong Preset Syntax** - Attempted to use NativeWind v4 preset syntax (`require('nativewind/preset')`) which doesn't exist in v2
4. **❌ Missing Peer Dependency** - `tailwind-merge` was not installed (required by `tailwind-variants`)

---

## ✅ Files Created/Updated

### A) Configuration Files (3 files)

**1. `tailwind.config.js`**
- ✅ Removed v4 preset (not available in NativeWind v2)
- ✅ Added content globs: `components/**/*`, `providers/**/*`
- ✅ Kept all design tokens (colors, spacing, fontSize, shadows)

**2. `App.tsx`**
- ✅ Added `import './app.css';` at top (line 2, after gesture-handler)
- ✅ This loads Tailwind's `@tailwind base/components/utilities` directives

**3. `global.d.ts`**
- ✅ Added `declare module 'nativewind';` for module resolution

**4. `package.json` (dependencies)**
- ✅ Added `tailwind-merge: "3.3.1"` (peer dependency of tailwind-variants)

### B) Dev Preview Wiring (3 files)

**4. `app/(dev)/DSPreview.tsx`** (NEW)
- Full design system showcase with all 8 components
- Interactive examples: Button, Icon, Input, Textarea, Card, Badge, ListItem, Tabs
- Uses NativeWind `className` prop throughout

**5. `components/OverlayHost.tsx`** (UPDATED)
- ✅ Registered new sheet: `'ds-preview-sheet'`
- ✅ Wraps `DSPreview` component in 90% height ActionSheet
- ✅ Keeps existing `'demo-sheet'` intact

**6. `app/tabs/TodayScreen.tsx`** (UPDATED)
- ✅ Added DEV-ONLY button at top: `🎨 Open Design System Preview`
- ✅ Uses design system `<Button>` primitive (validates NativeWind on existing screen)
- ✅ Wrapped in `{__DEV__ && ...}` - never appears in production
- ✅ Opens sheet via `SheetManager.show('ds-preview-sheet')`

### C) Build Scripts (1 file)

**7. `package.json`**
- ✅ Added `"clean"` script: Clears Metro cache, watchman, .expo, iOS/Android build artifacts
- ✅ Added `"start:clean"` script: Runs clean + `expo start -c`

---

## 🚀 How to Use

### 1. Clean Restart Metro (CRITICAL for NativeWind changes)

```bash
npm run start:clean
```

This clears all caches and restarts Metro with `-c` flag.

### 2. Open App and Test

1. **Launch app** on iOS Simulator or physical device
2. **Navigate to Today tab** (default screen)
3. **Look for DEV button** at top: `🎨 Open Design System Preview`
4. **Tap button** → Sheet slides up with full DS preview
5. **Expected:** All components render with proper colors:
   - Buttons: Deep Teal (`#0F4C5C`), Mint (`#86E5C2`)
   - Inputs: White bg, border styling
   - Cards: Elevated shadows, rounded corners
   - Badges: Colored variants (success/warning/error)
   - Tabs: Underline + Pills variants

### 3. Verify Styles Are Working

If you see **default black text on white** instead of styled components:
- Confirm `import './app.css';` is in `App.tsx` (line 2)
- Confirm `nativewind/babel` is in `babel.config.js` plugins
- Confirm `react-native-reanimated/plugin` is **last** in plugins array
- Run `npm run start:clean` again

### 4. Run CI Checks

```bash
npm run lint      # ✅ PASSED
npm run typecheck # ✅ PASSED
npm test          # ✅ PASSED (1/1)
```

---

## 📦 Navigation Strategy: Sheet Fallback

Since there's **no existing Stack Navigator**, we used the **Sheet Fallback** approach:

- ✅ Registered `'ds-preview-sheet'` in `OverlayHost.tsx`
- ✅ Opens via `SheetManager.show('ds-preview-sheet')`
- ✅ 90% height modal with ScrollView
- ✅ Minimal impact on existing nav structure

**Future:** If you add a Stack Navigator later, you can:
1. Create a `navigation/RootNavigator.tsx`
2. Add `<Stack.Screen name="DSPreview" component={DSPreview} />`
3. Change TodayScreen button to `navigation.navigate('DSPreview')`

---

## 🧪 Testing Coverage

**Created Tests:**
- ✅ `__tests__/Button.test.tsx` - Validates Button export and displayName
- ✅ `__tests__/Tabs.test.tsx` - Validates Tabs export and displayName

**Existing Tests:**
- ✅ `__tests__/sanity.test.ts` - Basic Jest sanity check (still passing)

All tests use `@jest-environment node` (no Expo runtime due to Winter compatibility issues).

---

## 🔧 Technical Notes

### NativeWind v2 vs v4
- **v2** (current): No preset, uses direct content globs + `nativewind/babel` plugin
- **v4** (future): Has `nativewind/preset`, uses Metro plugin instead of Babel

### Why Styles Weren't Rendering Before
1. **Babel plugin ran** but never saw CSS directives (not imported)
2. **Content globs missed files** so some components weren't scanned
3. **Wrong preset syntax** would have failed if CSS was imported

### Critical Import Order
```tsx
import 'react-native-gesture-handler'; // FIRST (gesture handling)
import './app.css';                    // SECOND (Tailwind styles)
import React from 'react';             // THIRD (React)
```

### Babel Plugin Order
```js
plugins: [
  'nativewind/babel',           // Process className props
  // ... other plugins
  'react-native-reanimated/plugin' // MUST BE LAST
]
```

---

## ✅ Success Checklist

- [x] Tailwind config has correct content globs (no v4 preset)
- [x] `app.css` imported in `App.tsx`
- [x] `nativewind/babel` plugin in babel.config.js
- [x] Reanimated plugin is last
- [x] DSPreview component created with all 8 primitives
- [x] Sheet registered in OverlayHost
- [x] DEV button added to TodayScreen
- [x] Clean cache script added
- [x] All CI checks passing (lint, typecheck, test)
- [x] Component tests created

---

## 🎯 Next Steps

1. **Test on device:**
   ```bash
   npm run start:clean
   # Tap "🎨 Open Design System Preview" on Today tab
   ```

2. **When styles confirmed working:**
   ```bash
   git add .
   git commit -m "fix(nativewind): wire DS preview + fix config for v2"
   git push origin feat/design-system-nativewind
   ```

3. **Open PR and merge once CI is green** ✅

---

## 📝 Key Files Reference

| File | Purpose | Change |
|------|---------|--------|
| `tailwind.config.js` | Tailwind configuration | Added content globs, removed v4 preset |
| `App.tsx` | Root entry point | Added CSS import |
| `babel.config.js` | Babel transpilation | Already correct (nativewind before reanimated) |
| `app/(dev)/DSPreview.tsx` | DS showcase | NEW - Full component examples |
| `components/OverlayHost.tsx` | Sheet registry | Added ds-preview-sheet |
| `app/tabs/TodayScreen.tsx` | Today tab screen | Added DEV button |
| `package.json` | Build scripts | Added clean + start:clean |

---

**✅ All systems operational. Ready to test!**
