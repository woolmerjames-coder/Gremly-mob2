# Phase 10.7D Implementation Plan: Hardened Space Chat

**Status**: 50% Complete (Foundation Implemented)  
**Branch**: `feat/10.7B-conversation-refinement`  
**Date**: October 22, 2025  
**Last Commit**: 50cdfae

## Completed ✅

### 1. Intent Detection Hardening ✅
**File**: `lib/cortex/intents/detectIntent.ts`
- ✅ New priority order: question > note > habit > todo > reflection > idea
- ✅ Adjusted thresholds: habit≥0.85, todo≥0.88, note≥0.80, question≥0.70
- ✅ Added planning/exploring detector (highest priority)
- ✅ Added `suppressChips` and `isPlanning` flags
- ✅ Planning phrases: "planning", "thinking about", "explore", "not ready", "just planning ahead", "maybe", "considering", "might"

### 2. Type Definitions ✅
**File**: `lib/cortex/intents/types.ts`
- ✅ Added `suppressChips?: boolean` to DetectedIntent
- ✅ Added `isPlanning?: boolean` to DetectedIntent

**File**: `lib/cortex/lane.ts`
- ✅ Added `intentCooldownTurns?: number` - tracks cooldown (0 = can show chips)
- ✅ Added `runningSummary?: string | null` - ~700 char summary
- ✅ Added `contextWindow?: Array<{role, text}>` - last N messages

### 3. Context & Memory Helpers ✅
**File**: `lib/cortex/context/memory.ts` (NEW)
- ✅ `buildContextWindow()` - extracts last N turns (default 8)
- ✅ `summarize()` - creates extractive summary (~700 chars)
- ✅ `updateRunningSummary()` - maintains rolling summary
- ✅ `hasExplicitCreationIntent()` - detects "add/save/create/make this a"
- ✅ `isAffirmation()` - detects "yes/ok/sure" responses

### 4. Persona Updates ✅
**File**: `lib/cortex/persona/prompt.ts`
- ✅ Updated PERSONA_PROMPT: "Be brief (≤2 sentences), warm, practical"
- ✅ Added rule: "Refuse to turn a question into a to-do unless user explicitly asks"
- ✅ Added `getClarificationPrompt()` - for planning requests with max bullets cap
- ✅ Applied brevity to all tone variants

### 5. Environment Flags ✅
**File**: `.env.local`
- ✅ EXPO_PUBLIC_CHAT_MAX_CONTEXT=8
- ✅ EXPO_PUBLIC_INTENT_COOLDOWN_TURNS=2
- ✅ EXPO_PUBLIC_REPLY_MAX_BULLETS=5

## Remaining Work 🚧

### 6. Conversation Pipeline Integration (HIGH PRIORITY)
**File**: `lib/cortex/pipelines/conversation.ts`

**Status**: Started but needs clean implementation

**Required Changes**:

1. **Add imports** (line 1-15):
```typescript
import {
  buildContextWindow,
  summarize,
  updateRunningSummary,
  hasExplicitCreationIntent,
  isAffirmation,
  type ChatTurn,
} from '../context/memory';
```

2. **Build context window** (after function start, ~line 125):
```typescript
// Phase 10.7D: Build context window and running summary
const maxContext = parseInt(process.env.EXPO_PUBLIC_CHAT_MAX_CONTEXT || '8', 10);
const allMessages: ChatTurn[] = (input as any).messages || [];
const contextWindow = buildContextWindow(allMessages, maxContext);

if (!ctx.runningSummary && allMessages.length > 2) {
  ctx.runningSummary = await summarize(allMessages);
}
```

3. **Add empathy check** (before smalltalk check, ~line 140):
```typescript
// Phase 10.7D: Check for empathy signals
if (/\b(oh no|what's wrong|i'm upset|i'm sad|i'm worried|feeling down)\b/i.test(userText.toLowerCase())) {
  return {
    mode: 'ask' as const,
    actions: [],
    suggestions: [],
    replyText: "I'm here for you. What's going on?",
    confidence: 0,
    meta: { kind: 'empathy', empathy_triggered: true },
  };
}
```

4. **Add cooldown logic** (after intent detection, ~line 235):
```typescript
// Phase 10.7D: Get cooldown settings
const cooldownTurns = parseInt(process.env.EXPO_PUBLIC_INTENT_COOLDOWN_TURNS || '2', 10);
let intentCooldown = ctx.intentCooldownTurns || 0;

if (intentCooldown > 0) {
  intentCooldown--;
}

const hasExplicitIntent = hasExplicitCreationIntent(userText);
const isUserAffirming = isAffirmation(userText);
const bypassCooldown = hasExplicitIntent || isUserAffirming;
```

5. **Update thresholds** (replace old threshold logic):
```typescript
const intentThresholds: Record<string, number> = {
  habit: 0.85,
  todo: 0.88,
  note: 0.80,
  question: 0.70,
  reflection: 0.75,
  idea: 0.75,
};

const threshold = intentThresholds[intent.kind] || 0.80;
const shouldShowChip =
  intent.confidence >= threshold &&
  intent.kind !== 'none' &&
  intent.kind !== 'question' &&
  !intent.suppressChips &&
  (intentCooldown === 0 || bypassCooldown);
```

6. **Add planning mode handler** (in intent handling block):
```typescript
if (intent.isPlanning || intent.suppressChips) {
  normalized.replyText = normalized.replyText || "I can help you think through that. What aspect would you like to explore?";
  normalized.mode = 'ask';
  normalized.suggestions = [];
  // Don't update cooldown for planning responses
} else if (intent.kind === 'question') {
  // existing question logic...
} else {
  // existing chip logic...
}
```

7. **Set cooldown when chip shown** (in chip showing block):
```typescript
if (shouldShowChip && (intentReiterated || bypassCooldown)) {
  // ... existing chip code ...
  
  // Phase 10.7D: Set cooldown
  ctx.intentCooldownTurns = cooldownTurns;
  
  normalized.meta = {
    ...normalized.meta,
    showedChip: true,
    cooldownSet: cooldownTurns,
  };
} else {
  // ... no chip code ...
  
  // Phase 10.7D: Update cooldown
  ctx.intentCooldownTurns = intentCooldown;
}
```

8. **Update running summary** (before fallback check):
```typescript
// Phase 10.7D: Update running summary after response
if (normalized.replyText && allMessages.length > 0) {
  const newMessages: ChatTurn[] = [
    ...allMessages.slice(-2),
    { role: 'user', text: userText },
    { role: 'assistant', text: normalized.replyText },
  ];
  ctx.runningSummary = await updateRunningSummary(ctx.runningSummary || '', newMessages);
}
```

### 7. ChatThreadScreen Updates (MEDIUM PRIORITY)
**File**: `app/spaces/ChatThreadScreen.tsx`

#### Debounce Send
```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedSend = useDebouncedCallback((text: string) => {
  handleSendImmediate(text);
}, 200);
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
    prefill: initial,
  });
  
  openUnifiedFromChat(kind, initial, {...}, overlayController);
}, [lastUserMessage, detectedIntent]);
```

### 8. Tests (LOW PRIORITY)

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
});
```

#### Cooldown
**File**: `__tests__/conversation/cooldown.test.ts` (NEW)
- Test chip shown once, suppressed next 2 turns
- Test explicit verbs bypass cooldown
- Test affirmation bypasses cooldown

#### Overlay Prefill
**File**: `__tests__/overlay/prefill-notes.test.tsx` (NEW)
- Test note prefills body not title
- Test habit/todo prefills title

## Implementation Priority

1. **CRITICAL**: Conversation pipeline cooldown + context (30 min)
2. **HIGH**: ChatThreadScreen debounce + prefill fix (15 min)
3. **MEDIUM**: Tests (30 min)

## Next Steps

1. Apply conversation.ts changes carefully using the code snippets above
2. Update ChatThreadScreen.tsx with debounce and prefill
3. Add tests incrementally
4. Run `npm run test:ci`
5. Commit with message: "feat(10.7D): Complete Space Chat hardening"

## Notes

- Foundation (50%) is complete and pushed (commit 50cdfae)
- Conversation pipeline needs careful integration due to complexity
- All foundation files have 0 TypeScript errors
- Environment flags already configured

