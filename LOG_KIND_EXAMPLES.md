# Log Kind Classification Examples

This document shows how the `classifyLogKind()` function classifies different types of text.

## Journal Entries

Text classified as `'journal'` when it contains emotional/reflective language:

```typescript
classifyLogKind('I feel great today!') 
// → 'journal'

classifyLogKind("I'm feeling anxious about the meeting")
// → 'journal'

classifyLogKind('Today was amazing, I accomplished so much')
// → 'journal'

classifyLogKind('This morning I woke up feeling refreshed')
// → 'journal'

classifyLogKind('This evening I realized something important')
// → 'journal'

classifyLogKind('I am grateful for my friends')
// → 'journal'

classifyLogKind('I was happy to see progress')
// → 'journal'
```

**Detection Pattern**: `/\b(i feel|i'm feeling|feeling|today\b|tonight\b|this morning\b|this evening\b|i am\b|i was\b)/`

## Ideas

Text classified as `'idea'` when it contains speculative/brainstorming language:

```typescript
classifyLogKind('Idea: create a new feature for the app')
// → 'idea'

classifyLogKind('What if we tried a different approach to this problem?')
// → 'idea'

classifyLogKind('Maybe we could improve the design with better colors')
// → 'idea'

classifyLogKind('Could we combine these two features?')
// → 'idea'

classifyLogKind('We should brainstorm solutions for next quarter')
// → 'idea'
```

**Detection Pattern**: `/\b(idea\b|what if\b|maybe we could\b|could we\b|we should\b|brainstorm\b)/`

## Lists

Text classified as `'list'` when it contains 2+ lines starting with bullets or numbers:

```typescript
classifyLogKind('- Task 1\n- Task 2\n- Task 3')
// → 'list'

classifyLogKind('* Item A\n* Item B\n* Item C')
// → 'list'

classifyLogKind('1. First thing\n2. Second thing\n3. Third thing')
// → 'list'

classifyLogKind('  - Indented item\n  - Another item\n  - Third item')
// → 'list'
```

**Detection Pattern**: `/^\s*([-*]|\d+\.)\s+/` (must match 2+ lines)

## Basic (Default)

Text classified as `'basic'` when it doesn't match other patterns:

```typescript
classifyLogKind('Just a regular note about something')
// → 'basic'

classifyLogKind('Meeting notes from the standup')
// → 'basic'

classifyLogKind('Some random observations')
// → 'basic'

classifyLogKind('')
// → 'basic'
```

## Priority Rules

When text could match multiple patterns, the classifier uses this priority order:

1. **List** (highest priority)
2. **Journal**
3. **Idea**
4. **Basic** (fallback)

### Examples:

```typescript
// List takes priority over journal
classifyLogKind('I feel great:\n- Task 1\n- Task 2')
// → 'list' (not 'journal')

// List takes priority over idea
classifyLogKind('Idea:\n* Point A\n* Point B\n* Point C')
// → 'list' (not 'idea')

// Journal takes priority over nothing
classifyLogKind('I feel amazing - great day')
// → 'journal' (not 'basic')
```

## Integration with Overlay

When you type in the overlay, classification happens automatically:

```typescript
// User types in log overlay
dispatch({ type: 'SET_TEXT', text: 'I feel wonderful today!' })

// State after dispatch:
state.log.body = 'I feel wonderful today!'
state.log.kind = 'journal' // ← Automatically classified
```

## Dev Console

In development builds, you'll see classification in the console:

```
[UnifiedOverlayV2] log kind: journal
[UnifiedOverlayV2] log kind: idea
[UnifiedOverlayV2] log kind: list
[UnifiedOverlayV2] log kind: basic
```

## Future UI Adaptations

Based on the classification, future phases can show different UI:

```typescript
// In UnifiedOverlayV2.tsx
const isJournalLog = isLog && logKind === 'journal';
const isIdeaLog = isLog && logKind === 'idea';
const isListLog = isLog && logKind === 'list';

// Conditional rendering (future phases)
{isJournalLog && <MoodSelector />}
{isJournalLog && <JournalTimestamp />}
{isIdeaLog && <IdeaBadge />}
{isListLog && <EnhancedListView />}
```
