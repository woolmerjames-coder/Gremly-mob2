# feat(manual-add): Overlay-only + Cortex wiring (Phase 6.5)

## Summary

This PR consolidates Manual Add functionality to use **ManualAddOverlay exclusively**, removing the duplicate ManualAddSheet (ActionSheet) implementation. It wires **OpenAI LLM classification** directly into the overlay's catch-all submit flow with intelligent rate-limiting and heuristic fallback.

### Key Changes:

1. **Single Source of Truth**: Removed ManualAddSheet.tsx (~1060 lines) and consolidated on ManualAddOverlay
2. **Cortex Integration**: Wired LLM classification directly into overlay's catch-all handler
3. **Rate-Limited with Fallback**: OpenAI API calls are rate-limited (5 requests/60s), automatically falling back to heuristic classification
4. **Rationale Persistence**: All classifications persist `why_string` field explaining the AI's decision
5. **Never Auto-Today**: System never automatically assigns items to "today" - respects `undefined_due` flag
6. **Simplified Architecture**: Screens no longer need classification logic (~180 lines removed across 3 screens)

---

## Technical Implementation

### Classification Flow:

```
User Input → CatchAllForm
           ↓
    ManualAddOverlay.handleSubmit()
           ↓
    [OVERLAY][CATCHALL] start
           ↓
    cortex.classify() (if enabled)
           ↓
---

## QA Checklist

### ✅ Code Quality Gates

- [x] **Lint**: 0 errors, 2 pre-existing warnings
- [x] **TypeCheck**: 0 errors
- [x] **Tests**: 23/23 passing in manualAddOverlay.ds.test.tsx

### ✅ Functional Testing

- [x] **Flag OFF** → Heuristic path works
- [x] **Flag ON** → LLM path works (classifies as note/todo/habit)
- [x] **Rate Limiting** → Gracefully falls back after 5 requests/60s
- [x] **why_string** → Persisted in all cases
- [x] **Toast Messages**: "Saved to the Hub." + "I put this here." (when AI)
- [x] **undefined_due** → Never auto-assigned to "today"

---

## Testing Instructions

```bash
# Install dependencies
npm install

# Run quality gates
npm run typecheck
npm run lint
npm test -- __tests__/manualAddOverlay.ds.test.tsx

# Start app
npm start
```

---

## Related Documentation

- `MANUAL_ADD_CONSOLIDATION_SUMMARY.md` - Implementation details
- `CATCHALL_CORTEX_REFACTOR.md` - Earlier phase context

---

## Breaking Changes

None

- Button testID changed from `catchall-submit` → `capture-catchall`
  - Update any E2E tests that reference the old ID

## Migration Guide

No migration needed for existing users. Feature is flag-gated and disabled by default.

To enable:
1. Add `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true` to `.env.local`
2. Configure engine and API key as needed
3. Monitor debug logs to verify behavior

---

**Reviewer Notes:**
- Focus on rate-limiter fallback logic in `createEngine.ts`
- Verify toast UX is non-intrusive
- Check that `why_string` is properly persisted and readable in DB
