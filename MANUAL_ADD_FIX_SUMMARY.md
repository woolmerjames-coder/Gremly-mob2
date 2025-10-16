# ManualAddSheet Visibility Fix - Changes Summary

## Problem
ManualAddSheet rendered but inputs/text were invisible, and the "Save to the Hub" CTA was hard to see.

## Root Causes
1. **Incorrect color tokens**: Used `text-gray-700`, `text-gray-900`, `bg-deepTeal` which don't exist in tailwind.config.js
2. **Missing placeholder colors**: TextInputs had no `placeholderTextColor` prop
3. **No explicit text color on inputs**: Inputs inherited potentially invisible colors on cream background
4. **Weak CTA styling**: Save button lacked visual prominence (no shadow, smaller hit area)

## Changes Made

### File: `components/ManualAddSheet.tsx`

#### 1. Added Debug Title (Line ~489-492)
```tsx
<View className="px-4 pt-2">
  <Text testID="debug-title" className="text-primary-500 font-bold text-xs">
    DEBUG: ManualAddSheet Mounted
  </Text>
</View>
```
**Why**: Confirms component renders and is visible

#### 2. Fixed Tab Button Colors (Line ~285-302)
**Before**:
```tsx
className={`... ${isActive ? 'bg-deepTeal' : 'bg-transparent'}`}
<Text className={`... ${isActive ? 'text-white' : 'text-gray-700'}`}>
```

**After**:
```tsx
className={`... ${isActive ? 'bg-primary-500' : 'bg-transparent'}`}
<Text className={`... ${isActive ? 'text-white' : 'text-text-primary'}`}>
```
**Why**: `deepTeal` and `gray-700` don't exist; replaced with valid theme tokens

#### 3. Fixed All TextInput Styling

**Habit Form** (Line ~314-357):
```tsx
// Before
className="... border-gray-300 ... bg-white"

// After
placeholderTextColor="#9CA3AF"
className="... border-border ... text-text-primary bg-white"
```

**Todo Form** (Line ~369-394):
- Added `placeholderTextColor="#9CA3AF"`
- Changed `border-gray-300` → `border-border`
- Added `text-text-primary` for visible text

**Journal Form** (Line ~403-432):
- Added `placeholderTextColor="#9CA3AF"`
- Changed `border-gray-300` → `border-border`
- Added `text-text-primary` for visible text
- Both title and body inputs fixed

**Catch-All Form** (Line ~440-457):
- Added `placeholderTextColor="#9CA3AF"`
- Changed `border-gray-300` → `border-border`
- Added `text-text-primary` for visible text

#### 4. Fixed All Label Colors
```tsx
// Before
<Text className="text-sm mb-1 text-gray-700">Label</Text>

// After
<Text className="text-sm mb-1 text-text-primary font-medium">Label</Text>
```
**Why**: `gray-700` doesn't exist; `text-primary` is the correct token for dark text on cream

#### 5. Fixed Error Message Colors
```tsx
// Before
<Text className="text-red-600 ...">

// After
<Text className="text-error ...">
```
**Why**: Use theme token `error` instead of arbitrary red

#### 6. Fixed Frequency Button Colors (Line ~330-345)
```tsx
// Before
border-deepTeal bg-deepTeal/10
text-deepTeal font-medium

// After
border-primary-500 bg-primary-50
text-primary-500 font-medium
```
**Why**: `deepTeal` isn't defined; `primary` is the correct token

#### 7. Enhanced Save Button (Line ~526-557)
**Before**:
```tsx
className={`${state.saving ? 'bg-gray-400' : 'bg-deepTeal'} ... py-3 ...`}
style={{ minHeight: 48 }}
```

**After**:
```tsx
hitSlop={12}
className={`${state.saving ? 'bg-text-disabled' : 'bg-primary-500'} ... py-4 ...`}
style={{
  minHeight: 56,
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
}}
```
**Changes**:
- Added `hitSlop={12}` for easier tapping
- Increased button height: 48 → 56
- Increased padding: py-3 → py-4
- Added shadow for visual depth
- Fixed color tokens: `gray-400` → `text-disabled`, `deepTeal` → `primary-500`

## Color Mapping (tailwind.config.js)

| ❌ Invalid (Used Before) | ✅ Valid (Used Now) | Purpose |
|-------------------------|---------------------|---------|
| `text-gray-700` | `text-text-primary` (#1A1A1A) | Dark text on cream |
| `text-gray-900` | `text-text-primary` | Dark text on cream |
| `bg-deepTeal` | `bg-primary-500` (#0F4C5C) | Deep teal brand color |
| `text-deepTeal` | `text-primary-500` | Deep teal brand color |
| `border-gray-300` | `border-border` (#E5E7EB) | Input borders |
| `text-red-600` | `text-error` (#EF4444) | Error messages |
| `bg-gray-400` | `bg-text-disabled` (#9CA3AF) | Disabled states |
| `bg-deepTeal/10` | `bg-primary-50` (#E6F2F4) | Light teal background |
| `border-deepTeal` | `border-primary-500` | Active state borders |

## Key Additions

1. **placeholderTextColor="#9CA3AF"** on ALL TextInputs
   - Ensures placeholder text is visible on white inputs against cream background
   
2. **text-text-primary** on ALL TextInputs
   - Ensures typed text is dark and readable
   
3. **font-medium** on all labels
   - Makes labels more prominent
   
4. **Debug title** at top
   - Proves component is rendering

## Testing Checklist

- [x] TypeCheck: Passes ✅
- [ ] Visual: Open ManualAddSheet and verify:
  - Debug title visible at top in teal
  - Tab buttons: inactive = dark text, active = white text on teal
  - All form labels visible in dark text
  - All input placeholders visible in gray
  - Typed text visible in dark color
  - Save button prominent with shadow
  - Error messages visible in red

## Next Steps

1. Test on device/simulator
2. Remove debug title once confirmed working
3. Run existing tests to ensure no regressions
4. Create screenshots for PR

## Files Modified
- `components/ManualAddSheet.tsx` (1 file, ~30 style changes)

## Related Files (Verified, No Changes Needed)
- `App.tsx` - ✅ Has GestureHandlerRootView and SheetProvider
- `tailwind.config.js` - ✅ Has correct color definitions
- `components/OverlayHost.tsx` - ✅ ManualAddSheet registered
- `components/PlusFAB.tsx` - ✅ Opens sheet correctly
