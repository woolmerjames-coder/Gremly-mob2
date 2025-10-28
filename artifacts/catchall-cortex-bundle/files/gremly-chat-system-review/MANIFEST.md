# Gremly Chat System Export - File Manifest
**Generated:** October 26, 2025  
**Branch:** feat/space-page-v3  
**Purpose:** External review of chat → action persistence flow

---

## 📋 Directory Structure

### 1. Main Chat Interface
- **`app/spaces/ChatThreadScreen.tsx`** - Main space chat UI (Phase 11.3 inline confirmations)
  - 1,575+ lines
  - Handles user messages, intent detection, action confirmations
  - Phase 11.6 entry cards
  - Phase 11.7 calm action bar with encouragement
  - **Recently modified:** Added back button navigation (Oct 26, 2025)

- **`app/screens/CatchAllNotepad.tsx`** - Catch-all notepad screen
  - Alternative chat interface for quick notes
  - Different lane (catch-all vs space_chat)

- **`app/spaces/chat/`** - Chat support utilities
  - Message prefill helpers
  - openUnified helpers for overlay integration

- **`app/lib/chat/`** - Chat events and utilities

### 2. Intent Detection & Classification System
- **`lib/cortex/intents/intentRules.ts`** - ⭐ **SINGLE SOURCE OF TRUTH**
  - Priority-ordered intent classification rules (Priority 0-99)
  - Meta-comment detection (Priority 0-9) - prevents false positives
  - Habit reminder detection (Priority 49)
  - Todo/note/habit creation detection
  - Confidence scoring

- **`lib/cortex/intents/detectIntent.ts`** - Main intent detection function
  - Takes text input, returns `DetectedIntent`
  - Applies intentRules in priority order
  - Returns first match above confidence threshold

- **`lib/cortex/intents/types.ts`** - Type definitions
  - `DetectedIntent` interface
  - Intent kinds: 'todo', 'note', 'habit', 'reminder', 'question', etc.
  - Confidence, suppressChips, isMetaComment flags

- **`lib/cortex/intents/multiIntentDetector.ts`** - Phase 11.5
  - Multi-intent detection for complex messages
  - Returns array of possible intents
  - Enables disambiguation UI

### 3. Decision Pipeline (Cortex)
- **`lib/cortex/cortexDecide.ts`** - Main entry point
  - `cortexDecide()` function
  - Handles errors, timeouts, retries
  - Calls router to select pipeline

- **`lib/cortex/router.ts`** - Pipeline routing
  - `cortexRoute()` function
  - Selects pipeline based on lane (space_chat, hub, today, catch-all)
  - Routes to conversation, classification, or other pipelines

- **`lib/cortex/pipelines/conversation.ts`** - ⭐ **SPACE CHAT PIPELINE**
  - Phase 10.7C-E implementation
  - `runConversationPipeline()` function
  - Calls LLM with context
  - Normalizes response
  - Returns reply text, explanation, intent

- **`lib/cortex/pipelines/classification.ts`** - Classification pipeline
  - For catch-all and other lanes
  - Intent-focused (less conversational)

### 4. Context & Memory System
- **`lib/cortex/context/memory.ts`** - Phase 10.7E
  - `buildChatContext()` fetches last N messages from database
  - Passes conversation history to LLM for continuity
  - Enables "remember what we talked about" behavior

- **`lib/cortex/context/assemble.ts`** - Context assembly
  - Formats context for LLM prompts
  - Includes user info, space info, recent messages

- **`lib/chat/contextualSummary.ts`** - ⭐ **YOUR RECENT WORK**
  - `createToastSummary()` - generates context-aware summaries for action confirmations
  - `extractActivityFromContext()` - looks back in conversation for actual activity discussed
  - `getActivityName()` - extracts habit/task names from messages
  - Used to show "Run 3 miles" instead of generic "habit" in toasts

### 5. AI Personality & Response Generation
- **`lib/cortex/persona/prompt.ts`** - Gremly persona definition
  - Phase 11.7 brand voice: warm, encouraging, concise
  - System prompts for different lanes
  - Personality traits and communication style

- **`lib/cortex/persona/refine.ts`** - Response post-processing
  - `smartRefine()` function
  - Removes meta-commentary (e.g., "Here's what I think...")
  - Enforces bullet limits
  - Maintains brand voice

- **`lib/cortex/smalltalk.ts`** - Greeting detection
  - Detects "hi", "hello", "hey" patterns
  - Returns friendly greetings
  - Prevents unnecessary LLM calls

- **`lib/cortex/explain.ts`** - Explanation helpers
  - Formats explanations for UI
  - Used in debug/development

### 6. Action Creation & Confirmation UI
- **`components/chat/InlineActionConfirmation.tsx`** - ⭐ Phase 11.3
  - Inline confirmation bubbles (replaced overlay toast)
  - Shows "Create habit: Run 3 miles" with Confirm/Edit/Cancel buttons
  - Calls `repo.create()` on confirm
  - Triggers EntryCard on success

- **`components/chat/MultiIntentConfirmation.tsx`** - Phase 11.5
  - Disambiguation UI for multiple intents
  - Shows 2 options when message is ambiguous
  - User selects which action to take

- **`components/chat/ChatActionBar.tsx`** - Phase 11.7
  - Centered + button with encouragement messages
  - Shows after creating items ("Keep it up!" after 3rd todo)
  - Calm, minimal design

- **`components/chat/EntryCard.tsx`** - ⭐ Phase 11.6
  - Cards that appear after creating habit/todo/note
  - Shows created item details
  - Tap to open edit overlay
  - Visual confirmation of successful save

- **`src/hooks/useActionToast.tsx`** - Legacy toast (replaced in Phase 11.3)
  - Animated toast hook
  - Still used in some non-chat screens

- **`components/common/ConfirmationPill.tsx`** - Pill component
  - Reusable confirmation UI element

### 7. Overlay System (Edit/Create Forms)
- **`components/overlay/UnifiedCreateOverlay.tsx`** - Modal for create/edit
  - Opens when user taps "Edit" button
  - Prefills with detected intent data
  - Handles save to database
  - Works for habits, todos, notes, journals, people

- **`components/overlay/fields/`** - Form field components
  - `HabitFields.tsx` - Habit creation form (frequency, reminder, etc.)
  - `TodoFields.tsx` - Todo creation form (due date, priority)
  - `NoteFields.tsx` - Note creation form (body, tags)
  - `JournalFields.tsx` - Journal entry form
  - `PersonFields.tsx` - Person/contact form

### 8. Repository Layer (Database Persistence)
- **`lib/repo/IRepo.ts`** - Repository interface
  - `create()` - creates entities (habits, todos, notes)
  - `update()` - updates entities
  - `delete()` - deletes entities
  - Type-safe CRUD operations

- **`lib/repo/supabase.ts`** - ⭐ Supabase implementation (production)
  - ~2,500+ lines
  - `SupabaseRepo` class
  - `create()` saves to Supabase database
  - `createHabit()`, `createTodo()`, `createNote()` implementations
  - Real-time subscriptions

- **`lib/repo/memory.ts`** - In-memory implementation (testing)
  - `MemoryRepo` class
  - Same interface, stores in memory
  - Used for tests and offline dev

- **`lib/types.ts`** - ⭐ Core entity types
  - `Habit` interface
  - `Todo` interface
  - `Note` interface
  - `SpaceChatMessage` interface
  - ~50+ types

- **`lib/schemas.ts`** - Zod validation schemas
  - Runtime type validation
  - Ensures data integrity before database saves

### 9. State Management Hooks
- **`hooks/useChatMessages.ts`** - Chat message persistence
  - `useChatMessages()` hook
  - `sendUserMessage()` - saves user message to DB
  - `appendAssistantMessage()` - saves Gremly response
  - `appendActionConfirmation()` - adds confirmation bubble to chat
  - `appendEntryCard()` - adds entry card after creation

- **`hooks/useUnifiedOverlayController.ts`** - Overlay state management
  - Opens/closes create/edit overlay
  - Manages prefill data
  - Handles save callbacks

- **`hooks/useMascotController.ts`** - Mascot animation state
  - Phase 10.6 mascot integration
  - Controls bob animation, visibility

### 10. Supporting Files
- **`lib/cortex/CortexClient.ts`** - Supabase Edge Function client
  - Makes requests to Cloudflare Workers (no OpenAI keys in app)
  - Handles timeouts, retries
  - Returns structured responses

- **`lib/cortex/lane.ts`** - Lane types
  - 'space_chat', 'hub', 'today', 'catch-all'
  - Different pipelines for different contexts

- **`lib/cortex/summarize.ts`** - Conversation summarization
  - Summarizes long conversations
  - Used for context building

- **`lib/cortex/thresholds.ts`** - Confidence thresholds
  - Defines confidence levels for different intents
  - Used in intent detection

- **`lib/env.ts`** - Environment configuration
  - Reads env vars
  - Feature flags

- **`package.json`** - Dependencies
  - React Native, Expo, Supabase, Zod, etc.

---

## 🔍 Key Functions for Review

### Intent → Action Flow (Complete Pipeline)

```
1. User types message in ChatThreadScreen.tsx (line ~550: handleSend)
   ↓
2. detectIntent(text) classifies message (lib/cortex/intents/detectIntent.ts)
   → Returns DetectedIntent with kind, confidence, metadata
   ↓
3. cortexRoute() selects pipeline (lib/cortex/router.ts)
   → Chooses 'space_chat' lane → runConversationPipeline()
   ↓
4. runConversationPipeline() processes (lib/cortex/pipelines/conversation.ts)
   → Calls LLM with context
   → Normalizes response
   → Returns reply text, explanation, intent
   ↓
5. createToastSummary() generates context-aware summary (lib/chat/contextualSummary.ts)
   → Looks back in conversation: "what did they actually say they want to do?"
   → Returns "Run 3 miles" instead of generic "habit"
   ↓
6. InlineActionConfirmation shows toast (components/chat/InlineActionConfirmation.tsx)
   → Displays: "Create habit: Run 3 miles" [Confirm] [Edit] [Cancel]
   ↓
7. [User clicks Confirm]
   ↓
8. repo.create() saves to database (lib/repo/supabase.ts)
   → Inserts into habits/todos/notes table
   → Returns created entity with ID
   ↓
9. EntryCard displays created item (components/chat/EntryCard.tsx)
   → Shows confirmation card in chat
   → Tap to edit → opens UnifiedCreateOverlay
```

### Functions that Create Entities (Database Persistence)

1. **`repo.create()`** in `lib/repo/IRepo.ts` (interface definition)
   - Called from: `InlineActionConfirmation.tsx` (confirm button)
   - Parameters: `{ type: 'habit' | 'todo' | 'note', ...payload }`
   - Returns: Created entity with generated ID

2. **`SupabaseRepo.create()`** in `lib/repo/supabase.ts` (line ~400+)
   - Implementation of `create()` interface
   - Saves to Supabase database
   - Specific methods:
     - `createHabit()` (line ~1200+)
     - `createTodo()` (line ~900+)
     - `createNote()` (line ~1400+)

3. **Helper functions in ChatThreadScreen:**
   - `handleConfirmTodo()` - calls `repo.create({ type: 'todo', ... })`
   - `handleConfirmNote()` - calls `repo.create({ type: 'note', ... })`
   - `handleConfirmHabit()` - calls `repo.create({ type: 'habit', ... })`

### Context-Aware Summary System (Recent Work - Oct 2025)

**Location:** `lib/chat/contextualSummary.ts`

1. **`createToastSummary()`** (line ~140)
   - **Purpose:** Generate smart summaries for action confirmations
   - **Called from:** `ChatThreadScreen.tsx` (line ~415)
   - **What it does:**
     - Takes: user message, detected intent, conversation history
     - Looks back in context to find what they're ACTUALLY talking about
     - Returns: "Run 3 miles" instead of generic "Create a habit"
   - **Example:**
     ```
     User: "I want to start running"
     Gremly: "That's great! How often?"
     User: "3 miles every morning"
     → createToastSummary() returns: "Run 3 miles"
     (not just "habit")
     ```

2. **`extractActivityFromContext()`** (line ~50)
   - Searches previous messages for activity keywords
   - Looks for patterns: "run X miles", "meditate for X min", etc.
   - Returns extracted activity name

3. **`getActivityName()`** (line ~180)
   - Extracts habit/task names from messages
   - Handles various formats
   - Used by `createToastSummary()`

**Why this matters:** Without context-aware summaries, all confirmations would say generic "Create a habit" instead of specific "Run 3 miles". This makes the UI much more intuitive.

---

## 📝 Files Modified in Last 7 Days

To find recently modified files, run:

```bash
# In the main repo (not the export):
git log --since="7 days ago" --name-only --pretty=format: -- \
  'app/spaces/ChatThreadScreen.tsx' \
  'lib/cortex/**/*.ts' \
  'lib/chat/**/*.ts' \
  'components/chat/**/*.tsx' \
  | sort -u

# Or check specific files:
git log -p --since="7 days ago" -- lib/chat/contextualSummary.ts
git log -p --since="7 days ago" -- app/spaces/ChatThreadScreen.tsx
```

**Known recent changes (Oct 26, 2025):**
- `app/spaces/ChatThreadScreen.tsx` - Added back button navigation
- `components/spaces/v33/*` - Space page v3.4 polish (mascot, goals, icons)

---

## ⚠️ Integration Points to Review

### 1. ChatThreadScreen → Cortex Pipeline
**File:** `app/spaces/ChatThreadScreen.tsx`
- **Line ~550:** `handleSend()` - user sends message
- **Line ~570:** `detectIntent(text)` - classify message
- **Line ~590:** `cortexRoute()` - select pipeline
- **Line ~415:** `createToastSummary()` - generate smart summary

**What to check:**
- Does `detectIntent()` return correct intent kind?
- Does `cortexRoute()` select correct pipeline?
- Does `createToastSummary()` use conversation context properly?

### 2. cortexRoute → runConversationPipeline
**File:** `lib/cortex/router.ts`
- Checks lane: if 'space_chat' → calls `runConversationPipeline()`
- Other lanes use different pipelines

**What to check:**
- Are lanes correctly assigned?
- Does space_chat actually use conversation pipeline?

### 3. InlineActionConfirmation → repo.create()
**File:** `components/chat/InlineActionConfirmation.tsx`
- Phase 11.3: Replaced overlay toast with inline bubbles
- Confirm button calls `repo.create()`
- Success → calls `appendEntryCard()` to show card

**What to check:**
- Does confirm button actually save to database?
- Does success trigger EntryCard?
- Do Edit/Cancel buttons work?

### 4. Context Building (Phase 10.7E)
**File:** `lib/cortex/context/memory.ts`
- `buildChatContext()` fetches last N messages
- Passes to LLM for continuity

**What to check:**
- Does it actually fetch from database?
- Is message order correct (oldest → newest)?
- Does LLM use this context in responses?

### 5. createToastSummary → extractActivityFromContext
**File:** `lib/chat/contextualSummary.ts`
- `createToastSummary()` calls `extractActivityFromContext()`
- Looks back in conversation history

**What to check:**
- Does it find activities from previous messages?
- Does it handle missing context gracefully?
- Are regex patterns still accurate?

---

## 🚨 Potential Regression Areas

### 1. Intent Classification (intentRules.ts)
**Risk:** Priority-ordered rules may conflict

**What to check:**
- Meta-comments should NEVER create actions (Priority 0-9)
  - "I'm thinking about starting a habit" → should NOT trigger habit creation
  - "wondering if I should..." → should NOT trigger action
- Habit reminder detection (Priority 49) should not conflict with habit creation
- Priority order: meta-comments (0-9) → reminders (40-49) → creation (50-59)

**Test cases:**
```typescript
// Should NOT create actions:
detectIntent("I'm thinking about starting a habit")
  → kind: 'question', suppressChips: true

// Should create habit:
detectIntent("I want to start running")
  → kind: 'habit', confidence: 0.9+

// Should create reminder:
detectIntent("remind me to run")
  → kind: 'reminder', confidence: 0.8+
```

### 2. Context-Aware Summaries (contextualSummary.ts)
**Risk:** `extractActivityFromContext()` may fail if message format changed

**What to check:**
- Regex patterns for activities (e.g., "run X miles", "meditate for X min")
- Handling of missing/empty conversation history
- Edge cases: very short messages, emoji-only messages

**Test cases:**
```typescript
// Should extract "Run 3 miles":
createToastSummary(
  "3 miles every morning",
  { kind: 'habit' },
  ["I want to start running", "That's great! How often?"]
)

// Should handle missing context:
createToastSummary(
  "start a habit",
  { kind: 'habit' },
  [] // empty history
) // Should return generic "habit" (graceful degradation)
```

### 3. Inline Confirmation Flow (Phase 11.3)
**Risk:** InlineActionConfirmation replaced ActionToast overlay

**What to check:**
- Confirm button actually calls `repo.create()`
- Edit button opens UnifiedCreateOverlay with correct prefill
- Cancel button dismisses without saving
- EntryCard appears after successful save

**Test flow:**
1. User: "I want to start running"
2. Gremly: shows InlineActionConfirmation
3. User clicks "Confirm"
4. Check: habit saved to database?
5. Check: EntryCard appears?
6. User taps EntryCard
7. Check: UnifiedCreateOverlay opens with habit data?

### 4. Multi-Intent Detection (Phase 11.5)
**Risk:** `detectMultipleIntents()` may create ambiguous intents

**What to check:**
- Messages with 2+ actionable intents show MultiIntentConfirmation
- User can select which intent to execute
- Only selected intent creates action (not both)

**Test case:**
```typescript
// Should detect 2 intents:
detectMultipleIntents("I need to buy groceries and call mom")
  → [{ kind: 'todo', title: 'buy groceries' }, 
      { kind: 'todo', title: 'call mom' }]

// User selects first → only creates "buy groceries" todo
```

### 5. Entry Cards (Phase 11.6)
**Risk:** EntryCard may not appear or tap gesture may fail

**What to check:**
- EntryCard appears after `appendEntryCard()` called
- Card displays correct habit/todo/note details
- Tap opens UnifiedCreateOverlay in edit mode
- Overlay prefills with correct data

**Test flow:**
1. Create habit via chat
2. Check: EntryCard appears at bottom of chat?
3. Tap EntryCard
4. Check: UnifiedCreateOverlay opens?
5. Check: Habit fields prefilled correctly?
6. Edit frequency, save
7. Check: habit updated in database?

---

## 🏗️ Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│  User types message in ChatThreadScreen                 │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  detectIntent(text) → DetectedIntent                    │
│  (lib/cortex/intents/detectIntent.ts)                   │
│  - Applies intentRules in priority order                │
│  - Returns kind, confidence, metadata                   │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  cortexRoute({ text }, context) → CortexResponse        │
│  (lib/cortex/router.ts)                                 │
│  - Selects pipeline based on lane                       │
│  - space_chat → runConversationPipeline()               │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  runConversationPipeline() → normalized response        │
│  (lib/cortex/pipelines/conversation.ts)                 │
│  - Builds context from recent messages                  │
│  - Calls LLM (via CortexClient → Cloudflare Worker)    │
│  - Normalizes response format                           │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  createToastSummary() → context-aware summary           │
│  (lib/chat/contextualSummary.ts)                        │
│  - Looks back in conversation for actual activity       │
│  - Returns "Run 3 miles" instead of "habit"             │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  InlineActionConfirmation (toast bubble)                │
│  (components/chat/InlineActionConfirmation.tsx)         │
│  - Shows: "Create habit: Run 3 miles"                   │
│  - Buttons: [Confirm] [Edit] [Cancel]                   │
└────────────────────┬────────────────────────────────────┘
                     ↓ [User clicks Confirm]
┌─────────────────────────────────────────────────────────┐
│  repo.create({ type: 'habit', ... })                    │
│  (lib/repo/supabase.ts)                                 │
│  - Inserts into Supabase database                       │
│  - Returns created entity with ID                       │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  EntryCard appears in chat                              │
│  (components/chat/EntryCard.tsx)                        │
│  - Shows created item details                           │
│  - Tap → opens UnifiedCreateOverlay (edit mode)         │
└─────────────────────────────────────────────────────────┘
```

---

## 📞 Documentation References

- **Intent system:** `lib/cortex/intents/README.md` (if exists in export)
- **Conversation pipeline:** `PHASE_10.7D_COMPLETE.md`
- **Context building:** `PHASE_10.7E_CONTEXT_BUILDING.md`
- **Inline confirmations:** `PHASE_11.3_INLINE_CONFIRMATIONS.md` (if exists)
- **Entry cards:** `ENTRY_CARDS_IMPLEMENTATION.md`
- **Brand voice:** `BRAND_VOICE_IMPLEMENTATION.md`
- **Action bar:** `CALM_ACTION_BAR.md`

---

## 🎯 What to Look For in Review

1. **Intent Detection Accuracy**
   - Are meta-comments correctly filtered out?
   - Do confidence thresholds make sense?
   - Are priority rules in correct order?

2. **Context Building**
   - Does `buildChatContext()` fetch messages correctly?
   - Is context passed to LLM?
   - Does `createToastSummary()` use context effectively?

3. **Database Persistence**
   - Do actions actually save to database?
   - Are all required fields included?
   - Does error handling work?

4. **UI Confirmation Flow**
   - Do inline confirmations appear?
   - Do buttons (Confirm/Edit/Cancel) work?
   - Do entry cards appear after creation?

5. **Edit Flow**
   - Does "Edit" button open overlay?
   - Are fields prefilled correctly?
   - Do changes save back to database?

6. **Regression Risks**
   - Any conflicts between recent changes?
   - Any breaking changes in dependencies?
   - Any missing error handling?

---

## 💡 Questions for Reviewer

1. **Intent Classification:**
   - Are the priority levels correct?
   - Should meta-comments have even lower priority (negative)?
   - Are confidence thresholds too strict or too loose?

2. **Context-Aware Summaries:**
   - Are regex patterns comprehensive enough?
   - Should we use LLM for summarization instead of regex?
   - How to handle edge cases (very short context)?

3. **Database Schema:**
   - Are all required fields being saved?
   - Any missing validation?
   - Any fields that should be required but aren't?

4. **UI/UX:**
   - Is inline confirmation better than overlay toast?
   - Should entry cards be dismissible?
   - Should we show loading state during save?

5. **Performance:**
   - Is context building too slow?
   - Should we cache LLM responses?
   - Are there too many database queries?

---

**End of Manifest**
