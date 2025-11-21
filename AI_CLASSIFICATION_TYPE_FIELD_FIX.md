# AI Classification Type Field Fix

## Problem
AI classification was never actually being used in production. The AI worker was returning `{"category": "todo", "confidence": 95}` but our parsing code expected `{"type": "todo", "confidence": 95}`. This caused 100% fallback to rule-based classification.

## Solution
1. **Updated AI Prompt** - Modified `AI_CLASSIFICATION_PROMPT` to explicitly instruct the AI to use "type" field:
   ```
   Return ONLY a JSON object with this exact format:
   {"type": "todo", "confidence": 95}
   
   Where type is one of: "todo", "habit", "log", "ignore"
   ```

2. **Backward Compatible Parsing** - Updated parsing logic to accept both fields:
   ```typescript
   const rawType = parsed.type ?? parsed.category;
   ```

3. **Comprehensive Test Coverage** - Added 3 new tests:
   - `should handle type field (new format)` - Verifies new "type" field works
   - `should handle category-only field (backward compat)` - Ensures old "category" field still works
   - Both tests verify AI classification is actually used (kind matches AI type)

## Test Results
✅ All 30 tests passing (1 skipped)
- 27 existing tests continue to pass
- 3 new tests verify the fix

## Impact
- AI classification will now actually be used when available
- Backward compatible with any old AI responses that still use "category"
- Development logging (`__DEV__`) will now show non-null `aiConfidence` values

## Files Changed
- `lib/cortex/intents/classifyIntentWithAI.ts` - Updated prompt and parsing logic
- `lib/cortex/intents/__tests__/classifyIntentWithAI.test.ts` - Added test coverage

## Next Steps
Monitor production logs for:
- Non-null `aiConfidence` values in Mind Drop decisions
- AI classification being used (fewer fallback warnings)
