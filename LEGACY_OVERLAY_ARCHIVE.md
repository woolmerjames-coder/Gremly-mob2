# Legacy Overlay Archival Summary

**Commit**: `02393e6`  
**Branch**: `feat/catchall-hub-optimizations`  
**Date**: October 18, 2025

## Objective

Archive the old create & edit overlays into `legacy/` without breaking imports, in preparation for migrating to `UnifiedCreateOverlay` (Phase 7).

## Changes Made

### 1. Directory Structure

Created new directory structure:
```
legacy/
├── README.md              # Documentation and migration guide
└── overlays/
    ├── index.ts           # Barrel export for test compatibility
    └── ManualAddOverlay.tsx  # Archived overlay (moved from components/)
```

### 2. Component Archival

**ManualAddOverlay.tsx**
- ✅ Moved from `components/` to `legacy/overlays/`
- ✅ Added `@deprecated` JSDoc header
- ✅ Updated internal import paths (relative to new location)
- ✅ No functional changes to the component itself

### 3. Import Path Updates

Updated all references to use legacy path:

**Application Files** (6 files):
- `app/tabs/HubScreen.tsx`
- `app/tabs/TodayScreen.tsx`
- `app/screens/SpaceDetailScreen.tsx`
- `components/OverlayHost.tsx`
- `examples/ManualAddOverlayExample.tsx`

**Test Files** (3 files):
- `__tests__/overlay-forms-visible.test.tsx`
- `__tests__/manualAddOverlay.ds.test.tsx`
- `__tests__/diagnostic/overlayRender.test.tsx`

All imports changed from:
```typescript
import { ManualAddOverlay } from '../components/ManualAddOverlay';
```

To:
```typescript
import { ManualAddOverlay } from '../legacy/overlays/ManualAddOverlay';
```

### 4. ESLint Configuration

Added lint guardrails to `eslint.config.js`:

**Main Rule**: Prevent legacy imports in application code
```javascript
'no-restricted-imports': [
  'error',
  {
    patterns: [
      {
        group: ['**/legacy/**', '../legacy/**', '../../legacy/**'],
        message: 'Importing from legacy/ is deprecated. Use UnifiedCreateOverlay instead. (Allowed in tests only)',
      },
    ],
  },
],
```

**Test Exception**: Allow legacy imports in test files
```javascript
{
  files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
  rules: {
    'no-restricted-imports': 'off',
  },
}
```

**Temporary Exemptions**: During migration period
```javascript
{
  files: [
    'app/tabs/HubScreen.tsx',
    'app/tabs/TodayScreen.tsx',
    'app/screens/SpaceDetailScreen.tsx',
    'components/OverlayHost.tsx',
    'examples/ManualAddOverlayExample.tsx',
  ],
  rules: {
    'no-restricted-imports': 'off',
  },
}
```

**Legacy Directory Ignored**: Added to top-level ignores
```javascript
ignores: [
  // ... other ignores
  'legacy/**', // Exclude legacy from linting
],
```

### 5. Documentation

Created `legacy/README.md` with:
- ⚠️ Deprecation warning
- Overview of archived components
- Current usage locations
- Lint rule explanation
- Migration plan checklist
- Developer guidelines

## Verification

✅ **TypeScript**: `npm run typecheck` passes  
✅ **ESLint**: `npm run lint` passes (with temporary exemptions)  
✅ **Tests**: Legacy overlay tests still pass  
✅ **Runtime**: No functional changes, imports resolve correctly

## Migration Status

### ✅ Completed
- [x] Create `legacy/overlays/` directory
- [x] Move `ManualAddOverlay.tsx` to legacy
- [x] Add `@deprecated` JSDoc headers
- [x] Update all import paths
- [x] Create barrel export for tests
- [x] Add ESLint rules to prevent legacy imports
- [x] Add temporary exemptions for active files
- [x] Create documentation (legacy/README.md)
- [x] Verify typecheck passes
- [x] Verify lint passes
- [x] Verify tests pass

### 🔄 Next Steps (In Order)
1. Create `UnifiedCreateOverlay` component (Phase 7)
2. Update `HubScreen.tsx` to use `UnifiedCreateOverlay`
3. Update `TodayScreen.tsx` to use `UnifiedCreateOverlay`
4. Update `SpaceDetailScreen.tsx` to use `UnifiedCreateOverlay`
5. Update `OverlayHost.tsx` to use `UnifiedCreateOverlay`
6. Remove temporary ESLint exemptions
7. Archive or update `examples/ManualAddOverlayExample.tsx`
8. Validate all tests pass with new overlay
9. Remove unused legacy components (optional - can keep for historical reference)

## Current State

**No Runtime Impact**: This is a pure refactor with no functional changes. All existing overlay functionality continues to work exactly as before, just with imports from the `legacy/` directory.

**Lint Protection**: New code attempting to import from `legacy/` will fail ESLint checks (except in tests), preventing accidental usage of deprecated components.

**Migration Ready**: The codebase is now structured to safely migrate to `UnifiedCreateOverlay` one screen at a time, with clear boundaries and protection against regressions.

## Testing

All existing tests continue to pass:
- `overlay-forms-visible.test.tsx` ✅
- `manualAddOverlay.ds.test.tsx` ✅
- `diagnostic/overlayRender.test.tsx` ✅

Test files can freely import from `legacy/` during the migration period.

## Notes

- The `ManualAddOverlay` component itself is unchanged - only its location and import paths
- No database schema changes
- No API changes
- No user-facing changes
- This is a preparatory step for Phase 7's unified overlay implementation
