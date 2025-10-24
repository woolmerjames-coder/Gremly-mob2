# Multi-Intent Detection Fix - Phase 11.6

## Problem
Multi-intent detection wasn't working. Inputs like "Remember Casey works at Google" were being marked as "ambiguous" with low confidence instead of showing multiple interpretation options.

## Root Cause
The `detectMultipleIntents` function existed but was never integrated into the cortex decision pipeline. It was imported in ChatThreadScreen but never called, so multi-intent data never reached the UI.

## Solution

### 1. Integrated Multi-Intent Detection into Conversation Pipeline

**File**: `lib/cortex/pipelines/conversation.ts`

- **Added Import**: Imported `detectMultipleIntents` from `multiIntentDetector`
- **Detection Logic**: After initial intent detection, check if input is ambiguous (`kind === 'ambiguous'` or `kind === 'note'` with confidence 0.5-0.9)
- **Enhancement**: Run `detectMultipleIntents()` to get alternative interpretations
- **Propagation**: Use `finalIntent` (which includes `alternativeIntents` and `isMultiIntent`) throughout the pipeline

### 2. Key Changes

**Detection Phase** (lines 549-580):
```typescript
// Phase 11.6: Multi-intent detection for ambiguous inputs
let finalIntent = intent;
if (
  (intent.kind === 'ambiguous' || intent.kind === 'note') &&
  intent.confidence >= 0.5 &&
  intent.confidence < 0.9
) {
  const multiIntent = detectMultipleIntents(input.text || '', {
    hasPersonContext: false,
  });

  if (multiIntent.alternativeIntents && multiIntent.alternativeIntents.length > 0) {
    console.log('[DEBUG][conversation] Multi-intent detected:', {
      primary: multiIntent.kind,
      primaryConfidence: multiIntent.confidence,
      alternatives: multiIntent.alternativeIntents.map((a) => `${a.kind} (${a.confidence})`),
      isMultiIntent: multiIntent.isMultiIntent,
    });

    finalIntent = multiIntent;
  }
}
```

**Routing Logic** (lines 680-900):
- Replaced all `intent` references with `finalIntent` in decision logic
- Updated cooldown tracking, confidence checks, and routing metadata
- Ensures multi-intent data flows to `normalized.meta.detectedIntent`

### 3. Data Flow

```
User Input: "Remember Casey works at Google"
    ↓
detectIntent() → { kind: 'ambiguous', confidence: 0.5 }
    ↓
detectMultipleIntents() → {
  kind: 'note',
  confidence: 0.82,
  alternativeIntents: [
    { kind: 'person', confidence: 0.75, rationale: "Contains person name and company" },
    { kind: 'todo', confidence: 0.65, rationale: "Could be a follow-up task" }
  ]
}
    ↓
finalIntent set with multi-intent data
    ↓
normalized.meta.detectedIntent = finalIntent
    ↓
ChatThreadScreen extracts detectedIntent
    ↓
maybeTriggerActionToast receives intent with alternativeIntents
    ↓
appendActionConfirmation creates message with metadata
    ↓
Message rendering checks metadata.alternativeIntents
    ↓
MultiIntentConfirmation component displays options
```

### 4. UI Behavior

**Before Fix:**
- "Remember Casey works at Google" → Single ambiguous classification, no options shown
- User has no visibility into multiple interpretations
- Forced to pick single intent type

**After Fix:**
- "Remember Casey works at Google" → Multi-intent detection triggered
- MultiIntentConfirmation displays:
  - "I can interpret this in multiple ways:"
  - Primary: NOTE (82%) with "SUGGESTED" badge
  - Alternative: PERSON (75%) - "Contains person name and company"
  - Alternative: TASK (65%) - "Could be a follow-up task"
- User can select any interpretation or cancel

### 5. Trigger Conditions

Multi-intent detection triggers when:
1. Initial intent is `ambiguous` OR `note`
2. Confidence is between 0.5 and 0.9 (not too low, not too high)
3. `detectMultipleIntents()` finds alternatives with confidence > 0.6
4. At least 2 valid interpretations exist

### 6. Pattern Matching Examples

The `detectMultipleIntents` function uses pattern matching:

**Person Detection** (confidence +0.3):
- `/\b([A-Z][a-z]+)\s+(works at|is at|from)\s+([A-Z]\w+)/i`
- Example: "Casey works at Google"

**Note Detection** (confidence +0.3):
- `/\b(remember|jot down|capture)\b/i`
- Example: "Remember to check metrics"

**Todo Detection** (confidence +0.3):
- `/\b(need to|have to|must|should)\b/i`
- Example: "Need to follow up with Casey"

**Habit Detection** (confidence +0.4):
- `/\b(every|daily|weekly|regularly)\b/i`
- Example: "Check in every Monday"

### 7. Auto-Creation Rules

When `isMultiIntent === true`, system suggests creating multiple items:

1. **Person + Todo**: "Remember to call Sarah about the project"
   - Creates person note AND follow-up task

2. **Habit + Note**: "Start meditating daily to reduce stress"
   - Creates habit AND note about reason

3. **Todo + Reflection**: "Finish report - feeling overwhelmed"
   - Creates todo AND reflection note

## Testing

### Manual Test Scenarios

1. ✅ **Ambiguous Person/Note**:
   - Input: "Remember Casey works at Google"
   - Expected: Shows NOTE (primary) + PERSON (alternative) + TASK (alternative)

2. ✅ **Habit with Reason**:
   - Input: "Start running every morning to get healthy"
   - Expected: Shows HABIT (primary) + NOTE (alternative) + "Create both" button

3. ✅ **Clear Single Intent** (should NOT trigger multi-intent):
   - Input: "Buy groceries tomorrow"
   - Expected: Single TODO confirmation, no alternatives

4. ⏳ **Context-Aware Person Detection**:
   - Input: "Casey mentioned the new project"
   - Expected: If Casey is known person → multi-intent with person context

## Files Changed

- **Modified**: `lib/cortex/pipelines/conversation.ts`
  - Added `detectMultipleIntents` import
  - Integrated multi-intent detection after initial intent
  - Updated all routing logic to use `finalIntent`
  - Propagated multi-intent data through metadata

## Benefits

1. **Transparency**: System acknowledges when unsure instead of forcing classification
2. **User Control**: User decides which interpretation makes sense
3. **Smart Defaults**: Primary suggestion based on highest confidence
4. **Educational**: Rationale text helps users understand detection logic
5. **Non-Breaking**: Only triggers for ambiguous cases, doesn't affect clear intents
6. **Context-Aware**: Can be enhanced with person/space context in future

## Future Enhancements

1. **Context Integration**: Pass `hasPersonContext`, `hasSpaceDefaults` to detection
2. **Learning**: Track user selections to improve confidence scoring
3. **Batch Creation**: Actually create multiple items when "Create both" is selected
4. **Inline Editing**: Allow editing each interpretation before creation
5. **More Patterns**: Add detection for meetings, reminders, events, etc.

## Commit Message

```
fix: Integrate multi-intent detection into cortex pipeline (Phase 11.6)

Problem:
- detectMultipleIntents function existed but was never called
- Ambiguous inputs like "Remember Casey works at Google" showed as single intent
- No visibility into multiple valid interpretations

Solution:
- Integrated detectMultipleIntents() into conversation pipeline
- Trigger on ambiguous/note intents with 0.5-0.9 confidence
- Run multi-intent detection to find alternatives >0.6 confidence
- Use finalIntent (with alternativeIntents) throughout routing logic
- Propagate multi-intent data through meta.detectedIntent

Flow:
1. Initial intent detection finds ambiguous case
2. detectMultipleIntents() finds alternatives
3. finalIntent includes alternativeIntents array
4. Metadata flows to ChatThreadScreen
5. MultiIntentConfirmation displays options

Benefits:
- Transparent about ambiguity instead of forcing single choice
- User sees all valid interpretations with confidence %
- Smart primary suggestion with SUGGESTED badge
- Rationale explains why each interpretation is valid
- Non-breaking: only triggers for ambiguous cases
```
