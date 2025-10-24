# Multi-Intent Detection Implementation - Phase 11.5

## Overview
Implemented sophisticated multi-intent detection that recognizes when user input could validly be multiple types, providing smart disambiguation and optional multi-creation.

## Core Philosophy
**No Forced Choices** - System acknowledges ambiguity rather than forcing a single classification when multiple interpretations are valid.

## Architecture

### 1. Type System Updates (`lib/cortex/intents/types.ts`)

```typescript
export interface AlternativeIntent {
  kind: IntentKind;
  confidence: number;
  subtype?: string;
  rationale: string; // Why this interpretation is valid
}

export interface DetectedIntent {
  // ... existing fields
  alternativeIntents?: AlternativeIntent[]; // Other valid interpretations
  isMultiIntent?: boolean; // Whether multiple intents should be created
}
```

### 2. Multi-Intent Detector (`lib/cortex/intents/multiIntentDetector.ts`)

**Key Functions:**

#### `detectMultipleIntents(text, context)`
- Runs detection for each possible type (todo, note, habit, reflection)
- Keeps all intents with confidence > 0.6
- Sorts by confidence (highest first)
- Returns primary intent with alternatives array

#### `detectIntentAsType(text, targetKind)`
- Forces classification as specific type
- Uses pattern matching for each type:
  - **Todo**: "need to", "have to", "remind me", time constraints
  - **Note**: "remember", "jot down", "thought", "idea"
  - **Habit**: "every", "daily", "regularly", "build", "practice"
  - **Reflection**: "feel", "think", "grateful", emotional language

#### `explainIntentChoice(text, kind)`
- Provides human-readable rationale for each interpretation
- Examples:
  - "Contains action language suggesting a task"
  - "Has time constraint indicating a todo"
  - "Contains recurring frequency language"

#### `shouldCreateMultiple(intents, context)`
Auto-creates multiple items ONLY when clearly beneficial:

1. **Person context + todo reminder**
   - "Remind me to call Sarah about the project"
   - Creates: Person note + Todo

2. **Habit + reason**
   - "Start meditating daily to reduce stress"
   - Creates: Habit + Note (with reason)

3. **Todo + reflection**
   - "Need to finish the report - feeling overwhelmed"
   - Creates: Todo + Reflection

### 3. Multi-Intent UI Component (`components/chat/MultiIntentConfirmation.tsx`)

**Features:**
- Question header: "I can interpret this in multiple ways:"
- Quoted content display
- Primary option with "SUGGESTED" badge
- Alternative options with rationale and confidence %
- Optional "Create both" button when `isMultiIntent=true`
- "Skip for now" cancel option

**Styling:**
- Linen Cream background
- Primary option: Moss Green border (2px), highlighted background
- Multi-create option: Sage Mist border
- Confidence badges and rationale text
- Professional, accessible design

### 4. Integration (`app/spaces/ChatThreadScreen.tsx`)

**Message Rendering:**
```typescript
if (message.role === 'action-confirmation') {
  const metadata = message.metadata_json || {};
  
  // Check for multi-intent
  if (metadata.alternativeIntents && metadata.alternativeIntents.length > 0) {
    return <MultiIntentConfirmation ... />;
  }
  
  // Standard single-intent
  return <InlineActionConfirmation ... />;
}
```

**Metadata Enhancement:**
- Includes `alternativeIntents` array
- Includes `isMultiIntent` flag
- Adds `confidence` value
- Provides `onCreateMultiple` handler

## User Experience Examples

### Example 1: Task vs. Note Ambiguity
```
User: "Remember to check the quarterly metrics"
→ Detects:
  - TASK (82%): "Contains action language (check)"
  - NOTE (71%): "Language suggests capturing information (remember)"
→ UI shows both options
→ User picks or creates both
```

### Example 2: Habit Context
```
User: "Start running every morning to get healthier"
→ Detects:
  - HABIT (91%): "Contains recurring frequency language (every morning)"
  - NOTE (74%): "Could be information worth noting (reason: to get healthier)"
→ isMultiIntent = true
→ Shows "Create both: Habit & Note" option
```

### Example 3: Person Context Auto-Creation
```
Context: Currently viewing "Sarah" person
User: "Need to call her about the project deadline"
→ Detects:
  - TASK (87%): "Contains action language (call, deadline)"
  - NOTE (79%): "Appears to be information for this person"
→ isMultiIntent = true (person context rule)
→ Creates both automatically when confirmed
```

### Example 4: Clear Single Intent
```
User: "Buy groceries tomorrow"
→ Detects:
  - TASK (94%): Clear action with deadline
→ No alternatives above 60% threshold
→ Shows standard single-intent confirmation
```

## Benefits

1. **User Control**: Never forces ambiguous choices
2. **Transparency**: Shows confidence levels and reasoning
3. **Context-Aware**: Uses conversation history for smart decisions
4. **Non-Breaking**: Falls back to single intent for clear cases
5. **Discoverable**: Users learn the system's capabilities through rationale text
6. **Flexible**: Can select any interpretation or create multiple

## Technical Implementation Details

### Detection Thresholds
- **Minimum confidence**: 0.6 to be considered alternative
- **Primary selection**: Highest confidence wins
- **Multi-creation threshold**: Varies by rule (typically 0.7+ for secondary)

### Pattern Matching Examples

**Todo Detection:**
```typescript
if (/\b(need to|have to|must|should)\b/i.test(text)) confidence += 0.3;
if (/\b(remind me|don't forget)\b/i.test(text)) confidence += 0.25;
if (/\b(by|before|deadline|due)\b/i.test(text)) confidence += 0.2;
```

**Habit Detection:**
```typescript
if (/\b(every|daily|weekly|regularly)\b/i.test(text)) confidence += 0.4;
if (/\b(start|build|develop|practice)\b/i.test(text)) confidence += 0.2;
```

**Reflection Detection:**
```typescript
if (/\b(feel|feeling|think|believe)\b/i.test(text)) confidence += 0.3;
if (/\b(grateful|proud|happy|sad|anxious)\b/i.test(text)) confidence += 0.25;
```

### Multi-Creation Rules

**Rule 1: Person Context + Todo**
```typescript
if (ctx.hasPersonContext && 
    kinds.includes('note') && 
    kinds.includes('todo') &&
    /\b(remind|remember to|need to call)\b/i.test(text)) {
  return true;
}
```

**Rule 2: Habit + Reason**
```typescript
if (kinds.includes('habit') && 
    kinds.includes('note') &&
    /\b(to|because|for|so that)\b/i.test(text) &&
    primary.confidence > 0.8 && 
    secondary.confidence > 0.7) {
  return true;
}
```

## Future Enhancements

1. **Batch Creation**: Implement queue for creating multiple items sequentially
2. **Learning**: Track user choices to improve future detection
3. **More Types**: Extend to ideas, questions, events
4. **Context Enrichment**: Use more conversation history for better decisions
5. **Custom Rules**: Allow user-defined multi-creation patterns

## Testing Scenarios

- [ ] "Need to buy milk" → Shows task/note options
- [ ] "Start meditating daily" → Shows habit, possibly multi-create
- [ ] "Feeling stressed about the deadline" → Shows reflection/todo
- [ ] In person context: "Remind me to call them" → Auto-creates both
- [ ] "Exercise every morning to feel better" → Offers habit+note creation
- [ ] "Buy groceries tomorrow" → Single intent (clear task)
- [ ] User selects alternative intent → Opens correct overlay
- [ ] User cancels multi-intent → No items created
- [ ] Multi-create button → Creates both items (when implemented)

## Commit Details
- **Hash**: `5cb2163`
- **Branch**: `fix/chat-system-logic-decision`
- **Files**: 4 changed (540 insertions, 2 deletions)
- **New Files**:
  - `lib/cortex/intents/multiIntentDetector.ts`
  - `components/chat/MultiIntentConfirmation.tsx`

## Integration Points

1. **Types**: Extended `DetectedIntent` interface
2. **Detector**: New `multiIntentDetector.ts` module
3. **UI**: New `MultiIntentConfirmation` component
4. **Chat Screen**: Enhanced message rendering logic
5. **Metadata**: Added alternative intents to confirmation messages

## Analytics Considerations

Track:
- Multi-intent detection frequency
- User selection patterns (primary vs. alternatives)
- Multi-creation usage
- Intent confidence distributions
- User override patterns

This data can improve detection rules and confidence thresholds over time.
