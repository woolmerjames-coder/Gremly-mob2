# Entry Cards in Chat Thread - Phase 11.6

## Overview
Implemented inline entry cards that appear in the chat thread when entries are created or when users ask to see them. Entry cards provide a rich preview with tap-to-edit functionality.

## Implementation Details

### 1. Type System Updates

**lib/types.ts**
- Extended `SpaceChatMessage` role to include `'entry-card'`
- Added Phase 11.6 comment to type definitions
- Both `SpaceChatMessage` and `SpaceChatMessageInsert` now support entry-card role

### 2. Chat Messages Hook

**hooks/useChatMessages.ts**
- Added `appendEntryCard()` function
- Takes entry object and entry type as parameters
- Stores full entry data in metadata_json
- Generates summary for content field
- Returns new message or undefined on error

```typescript
const appendEntryCard = useCallback(
  async (
    entry: Record<string, any>,
    entryType: 'note' | 'todo' | 'habit' | 'person',
  ): Promise<SpaceChatMessage | undefined> => {
    // Creates entry-card message with entry data in metadata
  },
  [chatId, spaceId, user?.id, messageRepo, chatRepo],
);
```

### 3. Entry Card Component

**components/chat/EntryCard.tsx** (NEW - 193 lines)
- Renders entry cards inline in chat thread
- Displays entry icon, type label, title, and preview
- Tap gesture opens unified overlay in edit mode
- Brand styling: Linen Cream background, Moss Green left border

**Features:**
- **Icons**: ⚡ Habit, ✓ Task, 📝 Note, 👤 Person
- **Type Labels**: Uppercase, Moss Green, letter-spacing 0.5
- **Preview Logic**:
  - Person: email + notes (truncated to 50 chars)
  - Note: body content (truncated to 100 chars)
  - Todo: due date + notes
  - Habit: frequency + notes
- **Styling**: 4px left border, 12px border radius, shadow for depth

### 4. Chat Screen Integration

**app/spaces/ChatThreadScreen.tsx**
- Imported EntryCard component
- Added Phase 11.6 comment to file header
- Destructured `appendEntryCard` from useChatMessages hook
- Added entry-card rendering in message map (before action-confirmation check)
- Updated UnifiedCreateOverlay onSaved callback

**Message Rendering Logic:**
```typescript
if (message.role === 'entry-card') {
  const metadata = message.metadata_json || {};
  const entry = metadata.entry;
  const entryType = metadata.entryType;

  if (entry && entryType) {
    const typedEntry = { ...entry, type: entryType };
    return (
      <EntryCard
        entry={typedEntry}
        onPress={(entry) => {
          overlayController.openEdit({
            record: entry as any,
            spaceId: spaceId ?? undefined,
          });
        }}
      />
    );
  }
}
```

**onSaved Callback:**
```typescript
onSaved={async (result) => {
  // Show success toast
  showChatConversionToast(`${itemType} created from chat ✨`);

  // Add entry card to chat thread
  const record = await repo.getById(result.id);
  if (record && (result.type === 'note' || result.type === 'todo' || result.type === 'habit')) {
    await appendEntryCard(record, result.type as 'note' | 'todo' | 'habit');
  }
}
```

## User Experience Flow

### Creation Flow
1. User sends chat message → AI detects intent
2. User confirms action → Opens overlay
3. User saves entry → Success toast appears
4. Entry card automatically appears in chat thread
5. Tapping card reopens overlay in edit mode

### Entry Card Appearance
```
┌─────────────────────────────────────┐
│ ⚡  HABIT                            │
│ Start running every morning         │
│ daily • Get healthier              │
│                                  ›  │
└─────────────────────────────────────┘
```

## Technical Considerations

### Data Storage
- Entry cards stored as regular chat messages with role='entry-card'
- Full entry object stored in metadata_json.entry
- Entry type stored in metadata_json.entryType
- Content field contains summary: `"${entryType}: ${entryName}"`

### Type Safety
- Union type for Entry: `Note | Todo | Habit | Person`
- Type guards for entry-specific properties
- Proper property name mapping (e.g., `name` for habits, `display_name` for people)

### Error Handling
- Try-catch around entry card creation
- Graceful fallback if entry fetch fails
- Console logging for debugging

### Future Enhancements

1. **Show on Request**: Detect "show me the entry" requests in cortex pipeline
2. **Multiple Cards**: Show recently created entries when user asks
3. **Context Awareness**: Link entries to conversation context
4. **Inline Actions**: Quick complete/edit actions on cards
5. **Rich Previews**: Show more entry details (tags, reminders, due dates)
6. **Animations**: Smooth card appearance with fade-in
7. **Batch Display**: Show multiple entries when creating from multi-intent

## Testing Scenarios

1. ✅ Create habit from chat → Entry card appears
2. ✅ Create todo from chat → Entry card appears
3. ✅ Create note from chat → Entry card appears
4. ✅ Tap entry card → Opens overlay in edit mode
5. ⏳ User asks "show me the entry" → Entry card appears (future)
6. ⏳ Create multiple from multi-intent → Multiple cards appear (future)

## Files Changed

**New Files:**
- `components/chat/EntryCard.tsx` (193 lines)

**Modified Files:**
- `lib/types.ts` - Added 'entry-card' role
- `hooks/useChatMessages.ts` - Added appendEntryCard function
- `app/spaces/ChatThreadScreen.tsx` - Integrated entry card rendering and creation

## Commit Message

```
feat: Add entry cards to chat thread (Phase 11.6)

Entry Card System:
- Created EntryCard component for inline entry display
- Shows entry icon, type, title, and preview
- Tap to edit in unified overlay
- Brand styling with Moss Green accent

Integration:
- Extended SpaceChatMessage with 'entry-card' role
- Added appendEntryCard() to useChatMessages hook
- Auto-creates entry cards when entries saved from chat
- Renders cards in message flow with proper styling

Benefits:
- Visual confirmation of created entries
- Quick access to edit entries from chat
- Better conversation continuity
- Non-breaking addition to existing flow
```
