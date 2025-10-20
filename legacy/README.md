# Legacy Overlays

**⚠️ DEPRECATED: These components are archived and should not be used in new code.**

## Overview

This directory contains legacy overlay components that have been archived as part of Phase 7 refactoring. All new development should use `UnifiedCreateOverlay` instead.

## Archived Components

### `ManualAddOverlay.tsx`
- **Original Purpose**: Full-screen modal for manual data entry (Phase 6)
- **Why Archived**: Being replaced with UnifiedCreateOverlay for better consistency and maintainability
- **Currently Used By**:
  - `app/tabs/HubScreen.tsx` (temporary, will be migrated)
  - `app/tabs/TodayScreen.tsx` (temporary, will be migrated)
  - `app/screens/SpaceDetailScreen.tsx` (temporary, will be migrated)
  - `components/OverlayHost.tsx` (temporary, will be migrated)
  - Test files (allowed to use legacy imports)

## Lint Rules

ESLint is configured to **prevent imports from `legacy/**`** in application code:

```javascript
// ❌ This will fail lint (except in tests):
import { ManualAddOverlay } from '../legacy/overlays/ManualAddOverlay';

// ✅ Use this instead:
import { UnifiedCreateOverlay } from '../components/UnifiedCreateOverlay';
```

**Exceptions**: 
- Test files (`**/__tests__/**`, `**/*.test.{ts,tsx}`) are allowed to import from legacy
- Specific files listed in `eslint.config.js` have temporary exemptions during migration

## Migration Plan

1. ✅ Move old overlays to `legacy/overlays/`
2. ✅ Add deprecation notices and lint guardrails
3. 🔄 Create `UnifiedCreateOverlay` component
4. 🔄 Update all application imports to use new overlay
5. 🔄 Remove temporary lint exemptions
6. ✅ Keep legacy components for test compatibility

## For Developers

- **Do NOT** add new code that imports from `legacy/`
- **Do NOT** extend or modify legacy components
- If you need overlay functionality, use `UnifiedCreateOverlay`
- Tests can continue using legacy components during transition period
