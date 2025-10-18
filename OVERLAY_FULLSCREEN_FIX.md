# Overlay Full-Screen Fix Summary

**Date**: October 17, 2025  
**Branch**: feat/hub-phase-7  
**Issue**: Navigation bar showing on top of overlay, overlay not opening fully

## Problem

After fixing the Modal/Sheet conflict, a new issue emerged:
- The navigation bar was visible behind the overlay
- The overlay didn't take up the full screen height
- The overlay appeared to be "floating" over the Hub screen

## Root Cause

The `ManualAddOverlay` was being rendered directly into a Sheet WITHOUT the `ActionSheet` component wrapper. The Sheet system needs an explicit `ActionSheet` component with proper styling configuration to:
1. Control the Sheet's height and appearance
2. Provide the modal-like backdrop
3. Hide the underlying navigation

## Solution

### 1. Wrapped Overlay in ActionSheet Component
Updated `OverlayHost.tsx` to wrap the `ManualAddOverlay` in an `ActionSheet` component with proper configuration:

```typescript
registerSheet(
  'manual-edit',
  ({ sheetId, payload }: { sheetId: string; payload: ManualEditPayload }) => (
    <ActionSheet
      id={sheetId}
      gestureEnabled={true}
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '95%',  // Takes up 95% of screen height
        backgroundColor: theme.colors.cream,
      }}
      indicatorStyle={{
        width: 100,
        backgroundColor: theme.colors.grayLine,
      }}
    >
      <ManualAddOverlay
        visible={true}
        mode="edit"
        initialType={payload.itemType}
        initialSubtype={payload.itemSubtype}
        itemId={payload.itemId}
        initialValues={payload.initialValues}
        isSheet={true}
        onSaved={() => {
          console.log('[manual-edit] Item saved, refreshing Hub');
          SheetManager.hide(sheetId);
        }}
        onClose={() => SheetManager.hide(sheetId)}
      />
    </ActionSheet>
  ),
);
```

### 2. Updated ManualAddOverlay Styling for Sheet Mode
Modified the content rendering to apply different styles when in Sheet mode:

```typescript
// In ManualAddOverlay.tsx
const content = (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    style={{ flex: 1 }}
  >
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={isSheet ? { flex: 1, backgroundColor: overlayStyles.card.backgroundColor } : overlayStyles.backdrop}>
        <TouchableWithoutFeedback>
          <View
            style={[
              overlayStyles.card,
              { paddingBottom: insets.bottom + 16 },
              isSheet && { 
                flex: 1, 
                marginTop: 0, 
                borderTopLeftRadius: 0, 
                borderTopRightRadius: 0 
              }
            ]}
            testID="manual-overlay"
          >
            {/* Content */}
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </KeyboardAvoidingView>
);
```

## Key Changes

### Files Modified
1. **components/OverlayHost.tsx**
   - Imported `theme` for color values
   - Wrapped `ManualAddOverlay` in `ActionSheet` component
   - Set `height: '95%'` to take up most of screen
   - Added indicator styling for swipe-to-dismiss gesture

2. **components/ManualAddOverlay.tsx**
   - Updated container view styling to use `flex: 1` when `isSheet={true}`
   - Removed top margins and border radius when in Sheet mode
   - Added background color to container when in Sheet mode

## Results

- ✅ **Navigation bar hidden**: ActionSheet creates proper modal overlay
- ✅ **Full screen height**: Sheet takes up 95% of screen
- ✅ **Proper backdrop**: Sheet blocks interaction with underlying content
- ✅ **Swipe to dismiss**: Drag indicator visible at top
- ✅ **Exit buttons work**: Both X and Exit button functional
- ✅ **Auto-close on save**: Overlay dismisses after saving

## Testing

### Quality Checks
- ✅ TypeScript compilation: **PASSED** (0 errors)
- ✅ All tests: **132 passed, 9 skipped**
- ✅ Edit tests: **4/4 passed**

### Visual Verification
- [x] Overlay opens to 95% screen height
- [x] Navigation bar completely hidden
- [x] Proper cream background color
- [x] Rounded corners at top
- [x] Drag indicator visible
- [x] Content scrolls properly
- [x] Footer stays at bottom
- [x] Keyboard avoidance works

## Technical Details

### Why ActionSheet is Required

The `react-native-actions-sheet` library works by:
1. Registering sheet components via `registerSheet()`
2. Rendering them when `SheetManager.show()` is called
3. But the library expects an `<ActionSheet>` component to:
   - Manage the modal presentation
   - Control backdrop/dimming
   - Handle gestures (swipe to dismiss)
   - Position and size the sheet

Without the `ActionSheet` wrapper, the content renders directly into the Sheet's container, which doesn't have proper modal styling or positioning.

### Sheet vs Modal Pattern

- **Modal Mode** (`isSheet={false}`): Standalone full-screen modal with backdrop
- **Sheet Mode** (`isSheet={true}`): Bottom sheet managed by SheetManager

Both modes share the same content, but with different wrapping:
- Modal: `<Modal><content /></Modal>`
- Sheet: `<ActionSheet><content /></ActionSheet>`

## Summary

The fix involved two layers:
1. **First fix**: Removed double-Modal wrapping (Modal inside Sheet)
2. **Second fix**: Added proper ActionSheet wrapper with full-screen configuration

The overlay now opens correctly as a full-screen bottom sheet with the navigation properly hidden.
