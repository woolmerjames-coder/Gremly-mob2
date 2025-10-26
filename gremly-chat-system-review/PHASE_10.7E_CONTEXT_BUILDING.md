# Phase 10.7E: Database-Backed Context Building

**Status:** ✅ Complete  
**Branch:** `feat/10.10-cortex-audit-hardening`  
**Commit:** `6c8357d`  
**Date:** 2025-01-24

## Overview

Implemented database-backed context building for Space Chat conversations, enabling Cortex to fetch message history directly from the database rather than relying on in-memory message passing. This provides better context for conversations and supports features like running summaries.

## Implementation

### 1. Core Function: `buildChatContext()`

**Location:** `lib/cortex/context/memory.ts`

```typescript
export async function buildChatContext(params: {
  spaceId: string;
  chatId: string;
  repo: any;
  max?: number;
  runningSummary?: string | null;
}): Promise<ChatContext>
```

**Features:**
- Fetches messages from `space_chat_messages` table via `repo.spaceChatMessages.list(chatId)`
- Sorts messages newest-first, slices to last N turns, reverses to oldest-first order
- Respects `EXPO_PUBLIC_CHAT_MAX_CONTEXT` environment variable (default: 8)
- Includes running summary if available
- Returns `ChatContext` with messages, summary, windowSize, and summaryLength
- Graceful error handling returns empty context

**Returns:**
```typescript
interface ChatContext {
  messages: ChatTurn[];
  summary: string;
  windowSize: number;
  summaryLength: number;
}
```

### 2. Extended CortexContext Interface

**Location:** `lib/cortex/cortexDecide.ts`

Added two new optional fields:
- `chatId?: string | null` - Chat thread identifier
- `repo?: any` - Repository instance for database access

This allows all Cortex calls to pass database context for message fetching.

### 3. Updated Conversation Pipeline

**Location:** `lib/cortex/pipelines/conversation.ts`

**New Path:**
```typescript
if (ctx.chatId && ctx.repo && ctx.spaceId) {
  const chatContext = await buildChatContext({
    spaceId: ctx.spaceId,
    chatId: ctx.chatId,
    repo: ctx.repo,
    max: maxContext,
    runningSummary: ctx.runningSummary || null,
  });
  contextWindow = chatContext.messages;
  runningSummary = chatContext.summary || undefined;
}
```

**Legacy Fallback:**
```typescript
else {
  const allMessages: ChatTurn[] = (input as any).messages || [];
  contextWindow = buildContextWindow(allMessages, maxContext);
}
```

**Logging:**
- New path: `[CORTEX][10.7E] context_built { windowSize, summaryLength }`
- Legacy path: `[CORTEX][10.7E] context_built_legacy { windowSize, summaryLength }`

### 4. Updated ChatThreadScreen

**Location:** `app/spaces/ChatThreadScreen.tsx`

Now passes `chatId` and `repo` to CortexContext:

```typescript
const cortexCtx: CortexContext = {
  // ... existing fields
  chatId: chat.id || null, // Phase 10.7E: For context building
  repo, // Phase 10.7E: For fetching messages
};
```

## Testing

### Unit Tests

**File:** `__tests__/cortex/context.build.test.ts`

**Coverage (6 tests):**
1. ✅ Builds context with messages and summary when messages exist
2. ✅ Generates summary when none exists and messages > 2
3. ✅ Respects max context window size
4. ✅ Returns empty context when no repo or chatId provided
5. ✅ Returns empty context on database error
6. ✅ Uses `EXPO_PUBLIC_CHAT_MAX_CONTEXT` env variable as default

### Integration Tests

**Updated:** `__tests__/cortex/conversation.intent.test.ts`
- Added `buildChatContext` mock to return empty context
- Fixed `buildContextWindow` mock to handle empty arrays: `(messages) => (messages || []).slice(-8)`
- All 13 tests passing

### Test Results

```
PASS  __tests__/cortex/context.build.test.ts
  ✓ builds context with messages and summary when messages exist (5 ms)
  ✓ generates summary when none exists and messages > 2 (3 ms)
  ✓ respects max context window size (2 ms)
  ✓ returns empty context when no repo or chatId provided (2 ms)
  ✓ returns empty context on database error (2 ms)
  ✓ uses EXPO_PUBLIC_CHAT_MAX_CONTEXT env variable as default (2 ms)

Test Suites: 9 passed, 9 total
Tests:       62 passed, 62 total
Time:        2.07 s
```

## Technical Decisions

### 1. Backwards Compatibility

Maintained legacy path for cases where:
- No chatId/repo/spaceId provided
- Tests that pass messages via input object
- Older code paths that haven't been migrated

### 2. Error Handling

Returns empty context on errors rather than throwing:
```typescript
try {
  const messages = await repo.spaceChatMessages.list(chatId);
  // ... process messages
} catch (error) {
  console.error('[CORTEX][10.7E] Error building chat context:', error);
  return { messages: [], summary: '', windowSize: 0, summaryLength: 0 };
}
```

This prevents conversation failures due to database issues.

### 3. Defensive Coding

Added null check for `contextWindow` before accessing length:
```typescript
if (normalized.replyText && contextWindow && contextWindow.length > 0) {
  // ... update summary
}
```

This prevents errors in test environments where contextWindow might be undefined.

### 4. Environment Variable

Uses `EXPO_PUBLIC_CHAT_MAX_CONTEXT` (default: 8) for maximum context window size:
- Configurable per environment
- Consistent across context building and legacy paths
- Documented in code comments

## Files Modified

1. `lib/cortex/context/memory.ts` (+82 lines)
   - New `ChatContext` interface
   - New `buildChatContext()` function

2. `lib/cortex/cortexDecide.ts` (+2 lines)
   - Extended `CortexContext` with `chatId` and `repo`

3. `lib/cortex/pipelines/conversation.ts` (+35 lines, -16 deletions)
   - Integrated `buildChatContext` with fallback
   - Added logging
   - Fixed `contextWindow` null check

4. `app/spaces/ChatThreadScreen.tsx` (+2 lines)
   - Pass `chatId` and `repo` to `CortexContext`

5. `__tests__/cortex/context.build.test.ts` (+209 lines, new file)
   - Comprehensive test coverage

6. `__tests__/cortex/conversation.intent.test.ts` (+2 lines)
   - Updated mocks for compatibility

## Environment Variables

- `EXPO_PUBLIC_CHAT_MAX_CONTEXT` (default: `'8'`)
  - Maximum number of message turns to include in context
  - Used by both new and legacy paths

- `EXPO_PUBLIC_DEBUG_CORTEX` (default: `undefined`)
  - When set to `'on'`, enables debug logging for context building

## Usage Example

```typescript
// In ChatThreadScreen, Cortex now automatically fetches context
const cortexCtx: CortexContext = {
  userId: user.id,
  spaceId: space.id,
  chatId: chat.id,      // ← New: enables database context
  repo,                 // ← New: enables database access
  lane: 'space_chat',
  // ... other fields
};

const result = await cortexRoute(input, cortexCtx);
```

## Logging Output

**With Debug Mode On:**
```
[CORTEX][10.7E] context_built { windowSize: 5, summaryLength: 186 }
```

**Without Debug Mode:**
- Database path: logs windowSize and summaryLength
- Legacy path: silent (only logs in debug mode)

## Benefits

1. **Better Context:** Access to full conversation history from database
2. **Scalability:** No need to pass messages through multiple layers
3. **Summaries:** Running summaries persist and can be retrieved
4. **Flexibility:** Easy to adjust context window size via env variable
5. **Resilience:** Graceful fallback on errors or missing data
6. **Testability:** Comprehensive unit tests with mocked repository

## Future Enhancements

1. Add telemetry for context fetch performance
2. Cache recent messages to reduce database queries
3. Implement sliding window for very long conversations
4. Add support for filtering messages by type (user/assistant)
5. Integrate with conversation summarization pipeline

## Related Work

- **Phase 10.10 P0 Batch A:** Cortex correctness fixes
- **Phase 10.7D:** Intent detection and chip suggestions
- **Phase 10.7C:** Smalltalk and greeting detection
- **Phase 10.7B:** Minimal reply with chips

## Notes

- All 62 Cortex tests passing
- No breaking changes to existing functionality
- Production-ready for Space Chat
- Committed and pushed to `feat/10.10-cortex-audit-hardening`

---

**Implementation Complete:** ✅  
**Tests Passing:** ✅  
**Documentation:** ✅  
**Committed:** ✅  
**Pushed:** ✅
