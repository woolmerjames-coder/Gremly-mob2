# Phase 10.7D Implementation Plan: Hardened Space Chat

**Status**: Partial Implementation  
**Branch**: `feat/10.7B-conversation-refinement`  
**Date**: October 22, 2025

## Completed ✅

### 1. Intent Detection Hardening
**File**: `lib/cortex/intents/detectIntent.ts`
- ✅ New priority order: question > note > habit > todo > reflection > idea
- ✅ Adjusted thresholds: habit≥0.85, todo≥0.88, note≥0.80, question≥0.70
- ✅ Added planning/exploring detector (highest priority)
- ✅ Added `suppressChips` and `isPlanning` flags
- ✅ Planning phrases: "planning", "thinking about", "explore", "not ready", "just planning ahead", "maybe", "considering", "might"

### 2. Type Definitions
**File**: `lib/cortex/intents/types.ts`
- ✅ Added `suppressChips?: boolean` to DetectedIntent
- ✅ Added `isPlanning?: boolean` to DetectedIntent

**File**: `lib/cortex/lane.ts`
- ✅ Added `intentCooldownTurns?: number` - tracks cooldown (0 = can show chips)
- ✅ Added `runningSummary?: string | null` - ~700 char summary
- ✅ Added `contextWindow?: Array<{role, text}>` - last N messages

### 3. Context & Memory Helpers
**File**: `lib/cortex/context/memory.ts` (NEW)
- ✅ `buildContextWindow()` - extracts last N turns (default 8)
- ✅ `summarize()` - creates extractive summary (~700 chars)
- ✅ `updateRunningSummary()` - maintains rolling summary
- ✅ `hasExplicitCreationIntent()` - detects "add/save/create/make this a"
- ✅ `isAffirmation()` - detects "yes/ok/sure" responses

### 4. Persona Updates
**File**: `lib/cortex/persona/prompt.ts`
- ✅ Updated PERSONA_PROMPT: "Be brief (≤2 sentences), warm, practical"
- ✅ Added rule: "Refuse to turn a question into a to-do unless user explicitly asks"
- ✅ Added `getClarificationPrompt()` - for planning requests with max bullets cap
- ✅ Applied brevity to all tone variants

## Remaining Work 🚧

### 5. Conversation Pipeline Updates
**File**: `lib/cortex/pipelines/conversation.ts`

#### Context Building
```typescript
// Build context window (last 8 turns)
const maxContext = parseInt(process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT || '8', 10);
const contextWindow = buildContextWindow(messages, maxContext);

// Get or update running summary
if (!ctx.runningSummary && messages.length > 2) {
  ctx.runningSummary = await summarize(messages);
}

// Pass to worker
const workerInput = {
  ...input,
  contextWindow,
  runningSummary: ctx.runningSummary,
};
```

#### Cooldown Logic
```typescript
// Check cooldown
const cooldownTurns = parseInt(process.env.EXPO_PUBLIC_INTENT_COOLDOWN_TURNS || '2', 10);
let intentCooldown = ctx.intentCooldownTurns || 0;

// Decrement cooldown each turn
if (intentCooldown > 0) {
  intentCooldown--;
}

// Can show chips if:
// 1. Cooldown is 0
// 2. Confidence >= threshold
// 3. Either explicit creation verb OR user affirmed previous suggestion
// 4. Not suppressed by intent (isPlanning/suppressChips)
const canShowChip = 
  intentCooldown === 0 &&
  intent.confidence >= thresholds[intent.kind] &&
  !intent.suppressChips &&
  (hasExplicitCreationIntent(input.text) || isAffirmation(input.text));

// If chip shown, set cooldown
if (chipShown) {
  intentCooldown = cooldownTurns;
}
```

#### Fallback Guard
```typescript
// If catch-all with no content, force direct worker call
if (wasCatchAllResponse && hasNoUsefulContent) {
  console.log('[CORTEX][10.7D] Enforcing fallback for empty catch-all');
  return await tryDirectWorkerCall(input, ctx);
}
```

#### Empathy Responses
```typescript
// Check for distress signals
if (/\b(oh no|what's wrong|i'm upset|i'm sad|i'm worried)\b/i.test(userText)) {
  return {
    mode: 'ask',
    replyText: "I'm here for you. What's going on?",
    suggestions: [],
    // ... full response
  };
}
```

### 6. ChatThreadScreen Updates
**File**: `app/spaces/ChatThreadScreen.tsx`

#### Debounce Send
```typescript
const [sendDebounceTimer, setSendDebounceTimer] = useState<NodeJS.Timeout | null>(null);

const debouncedSend = useCallback((text: string) => {
  if (sendDebounceTimer) {
    clearTimeout(sendDebounceTimer);
  }
  
  const timer = setTimeout(() => {
    handleSendImmediate(text);
  }, 200);
  
  setSendDebounceTimer(timer);
}, [sendDebounceTimer]);
```

#### SpaceId Validation
```typescript
if (!spaceId) {
  console.error('[ChatThread] Missing spaceId');
  Alert.alert('Error', 'Invalid space context');
  return;
}
```

#### Prefill Fix
```typescript
const convertFromChip = useCallback((kind: OverlayKind) => {
  const lastUserText = lastUserMessage || '';
  
  // For notes, put text in body, not title
  const initial = kind === 'note' 
    ? { title: '', note: lastUserText }
    : { title: lastUserText };
    
  console.log('[ChatThread][10.7D] Opening overlay:', {
    kind,
    hasTitle: !!initial.title,
    hasBody: !!(initial as any).note,
    prefill: initial,
  });
  
  openUnifiedFromChat(kind, initial, {...}, overlayController);
}, [lastUserMessage, detectedIntent]);
```

### 7. Environment Flags
**File**: `.env.local`
```bash
# Phase 10.7D: Hardened chat settings
EXPO_PUBLIC_CHAT_MAX_CONTEXT=8
EXPO_PUBLIC_INTENT_COOLDOWN_TURNS=2
EXPO_PUBLIC_REPLY_MAX_BULLETS=5
EXPO_PUBLIC_DEBUG_CORTEX=on
```

### 8. Tests

#### Intent Detection
**File**: `__tests__/conversation/intent-planning.test.ts` (NEW)
```typescript
describe('Planning/Exploring Detection', () => {
  test('I'm just planning ahead for exercise', () => {
    const intent = detectIntent("I'm just planning ahead for exercise");
    expect(intent.kind).toBe('question');
    expect(intent.suppressChips).toBe(true);
    expect(intent.isPlanning).toBe(true);
  });
  
  test('Run every morning starting Monday', () => {
    const intent = detectIntent('Run every morning starting Monday');
    expect(intent.kind).toBe('habit');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.85);
  });
});
```

#### Cooldown
**File**: `__tests__/conversation/cooldown.test.ts` (NEW)
```typescript
describe('Intent Cooldown', () => {
  test('chip shown once, suppressed next 2 turns', async () => {
    // First turn: show chip, set cooldown=2
    // Second turn: cooldown=1, no chip
    // Third turn: cooldown=0, no chip (unless reiterated)
    // Fourth turn: cooldown=0, can show chip again
  });
});
```

#### Small-talk
**File**: `__tests__/conversation/smalltalk.test.ts` (UPDATE)
```typescript
test('How are you? → natural reply, no intent detection', async () => {
  const response = await runConversationPipeline({text: 'How are you?'}, ctx);
  expect(response.meta?.kind).toBe('smalltalk');
  expect(response.suggestions).toEqual([]);
});
```

#### Overlay Prefill
**File**: `__tests__/overlay/prefill-notes.test.tsx` (NEW)
```typescript
test('Remember: cancel gym → note body filled', () => {
  // Click chip for note
  // Verify overlay opens with:
  // - initialTitle: ''
  // - initialBody: 'Remember: cancel gym'
});
```

## Acceptance Criteria Checklist

- [ ] Answers reference earlier turns for 6-8 messages
- [ ] "How are you?" → natural small-talk
- [ ] Planning phrases → advice, no chips
- [ ] Chips only when asked OR crystal-clear
- [ ] Chips suppressed for 2 turns after shown
- [ ] Clicking chip prefills overlay (note → body)
- [ ] No duplicate replies
- [ ] No empty catch-all responses
- [ ] Logs show spaceId and runningSummary
- [ ] Questions never converted to todos

## Implementation Priority

1. **HIGH**: Conversation pipeline cooldown + context
2. **HIGH**: ChatThreadScreen debounce + prefill fix
3. **MEDIUM**: Empathy responses
4. **MEDIUM**: Environment flags
5. **LOW**: Tests (can be added incrementally)

## Notes

- Current implementation is ~40% complete
- Core types and helpers are in place
- Main integration work remains in conversation.ts and ChatThreadScreen.tsx
- Tests will validate behavior once pipeline is complete
