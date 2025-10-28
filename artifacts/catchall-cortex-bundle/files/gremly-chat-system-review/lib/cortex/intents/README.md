# Intent Classification System - Single Source of Truth

**Last Updated**: October 24, 2025  
**Authority**: Commit `9d254c86` - Centralized Intent Classification Rules

---

## Architecture Overview

The intent classification system follows a **strict hierarchical architecture** with a single source of truth:

```
intentRules.ts (SINGLE SOURCE OF TRUTH)
    ↓
classifyIntent() - Priority-ordered rules system
    ↓
detectIntent() - Thin wrapper, adds curiosity suggestions only
    ↓
All other modules (cortexDecide, conversation pipeline, multiIntentDetector)
```

---

## Critical Rules

### ⚠️ NEVER bypass the centralized system

1. **ALL intent classification MUST go through `intentRules.ts`**
2. **NO direct regex pattern matching for intent detection outside of `intentRules.ts`**
3. **NO hardcoded intent assignments (e.g., `intent.kind = 'todo'`) except in `intentRules.ts`**

### ✅ Correct Usage

```typescript
// ✅ CORRECT - Use the centralized system
import { detectIntent } from './intents/detectIntent';
const intent = detectIntent(userText);

// ✅ CORRECT - Check the result
if (intent.kind === 'todo') {
  // Handle todo
}
```

### ❌ Incorrect Usage

```typescript
// ❌ WRONG - Direct pattern matching bypasses centralized rules
if (/\bremember\b/i.test(text)) {
  intent.kind = 'note';
}

// ❌ WRONG - Hardcoded classification
const intent = {
  kind: 'todo',
  confidence: 0.9,
  // ...
};

// ❌ WRONG - Creating classification logic outside intentRules.ts
function myCustomClassifier(text: string): IntentKind {
  if (text.includes('habit')) return 'habit';
  // ... more logic
}
```

---

## File Responsibilities

### `intentRules.ts` - THE SINGLE SOURCE OF TRUTH

**Purpose**: Define ALL intent classification rules in priority order

**Exports**:
- `classifyIntent(text: string): DetectedIntent` - Main classification function
- `INTENT_RULES: IntentRule[]` - Priority-ordered rule array
- `explainClassification(text: string): string` - Debugging helper

**Rule Priority System**:
```typescript
Priority 0-9:    System meta-comments (NEVER create actions)
Priority 10-19:  Opt-outs and hints
Priority 17:     Action-oriented reminders ("remember to [verb]" → todo)
Priority 18:     Information capture ("remember the/that" → note)
Priority 20-29:  Explicit commands
Priority 30-39:  Greetings
Priority 40-49:  Habit patterns
Priority 50-59:  Todo patterns
Priority 60-69:  Note patterns
Priority 70-79:  Ideas and reflections
Priority 80-89:  Questions
Priority 90-98:  Ambiguous cases
Priority 999:    Default fallback
```

**Adding New Rules**:
1. Add rule to `INTENT_RULES` array with appropriate priority
2. Higher priority (lower number) = checked first
3. First matching rule wins
4. Always include comprehensive tests

### `detectIntent.ts` - Thin Wrapper

**Purpose**: Public API for intent detection, adds optional enhancements

**Responsibilities**:
- Delegates to `classifyIntent()` for core classification
- Adds `curiositySuggestion` based on intent kind
- NO classification logic here

### `multiIntentDetector.ts` - Multi-Intent Analysis

**Purpose**: Detect when input could validly be multiple types

**Responsibilities**:
- Uses `detectIntent()` for base classification
- Provides alternative interpretations
- Biases toward different types for comparison
- NO standalone classification logic

### `types.ts` - Type Definitions

**Purpose**: Define TypeScript interfaces for intents

**Key Types**:
- `IntentKind` - Union type of all intent kinds
- `DetectedIntent` - Complete intent result with metadata
- `AlternativeIntent` - Alternative interpretation with rationale

---

## Recent Fixes and Lessons Learned

### Fix #1: Action Reminders vs Information Capture (Commit `4e01344`)

**Problem**: "Remember to call mom" was classified as 'note' instead of 'todo'

**Root Cause**: Generic "remember" pattern caught all cases without distinguishing action-oriented reminders

**Solution**: Added priority 17 rule for "remember to [action]" before generic "remember" rule

**Lesson**: When adding broad patterns, always consider more specific sub-cases first

### Fix #2: Command Intent Detection (Commit `23b22c0`)

**Problem**: Command verbs only detected at start of sentence

**Solution**: Updated patterns to match verbs anywhere: `\b(verb)\b(?:\s+\w+){0,4}\s*(object)\b`

**Lesson**: Patterns should be flexible enough to handle natural language variations

### Fix #3: Hint Phrases (Commit `9d254c8`)

**Problem**: "Remember" was being treated as command

**Solution**: Created separate priority 18 rule for hint phrases (isCommand: false)

**Lesson**: Distinguish between command verbs and information hints

---

## Testing Requirements

### Every Rule Change MUST Include Tests

**Required Test Coverage**:
1. **Positive cases**: Text that SHOULD match the rule
2. **Negative cases**: Text that should NOT match
3. **Edge cases**: Boundary conditions
4. **Priority conflicts**: Ensure higher priority rules win

**Test Files**:
- `__tests__/intent-classification.test.ts` - Core classification tests
- `__tests__/cortex/intent.command.test.ts` - Command detection tests
- `__tests__/cortex.biasing.test.ts` - Tone and biasing tests

### Example Test Pattern

```typescript
describe('Priority conflicts', () => {
  test('Meta-comment beats todo pattern', () => {
    const intent = classifyIntent('Why did you remind me about that?');
    expect(intent.isMetaComment).toBe(true);
    expect(intent.kind).toBe('question');
    expect(intent.requiresAction).toBe(false);
  });

  test('Action reminder beats information capture', () => {
    const intent = classifyIntent('Remember to call mom');
    expect(intent.kind).toBe('todo');
    expect(intent.requiresAction).toBe(true);
    
    const infoIntent = classifyIntent('Remember the restaurant name');
    expect(infoIntent.kind).toBe('note');
    expect(infoIntent.requiresAction).toBe(false);
  });
});
```

---

## Debugging

### Enable Debug Logging

Set environment variable:
```bash
EXPO_PUBLIC_DEBUG_CORTEX=on
```

This will log matched rules in console:
```typescript
[intentRules] Matched rule: {
  name: 'reminder_action_todo',
  priority: 17,
  kind: 'todo',
  text: 'Remember to call mom'
}
```

### Explain Classification

```typescript
import { explainClassification } from './intents/intentRules';

const explanation = explainClassification('Remember to call mom');
// Returns: 'Matched rule "reminder_action_todo" (priority 17)'
```

---

## Migration Guide

### If You Find Non-Centralized Intent Logic

1. **Identify the pattern**: What text patterns are being matched?
2. **Check intentRules.ts**: Does a rule already exist?
3. **Add/Update rule**: If not, add to `INTENT_RULES` array with correct priority
4. **Replace direct logic**: Remove hardcoded logic, use `detectIntent()` instead
5. **Add tests**: Ensure the change is covered by tests
6. **Document**: Update this README if needed

### Example Migration

**Before** (non-centralized):
```typescript
// In some module
function handleUserInput(text: string) {
  if (/\bremember\b/i.test(text)) {
    return { kind: 'note', confidence: 0.8 };
  }
  // ... more logic
}
```

**After** (centralized):
```typescript
// In that module
import { detectIntent } from './intents/detectIntent';

function handleUserInput(text: string) {
  const intent = detectIntent(text);
  return intent;
}
```

---

## Authority and Precedence

**Primary Authority**: `intentRules.ts` (commit `9d254c86`)

**Precedence Rules**:
1. If there's a conflict between `intentRules.ts` and any other file, **`intentRules.ts` ALWAYS wins**
2. Any classification logic outside `intentRules.ts` should be migrated into it
3. Changes to classification behavior should ONLY be made in `intentRules.ts`

**Commit History**:
- `9d254c86` - Established centralized rules system (AUTHORITY)
- `23b22c0` - Command intent detection updates
- `4e01344` - Action reminders vs information capture
- All future changes should reference this system

---

## Questions or Issues?

If you need to add a new intent pattern or modify classification behavior:

1. **Read this document first**
2. **Check existing rules** in `intentRules.ts`
3. **Add comprehensive tests**
4. **Update this README** if the change affects architecture

**Remember**: One source of truth, always delegate to `intentRules.ts`
