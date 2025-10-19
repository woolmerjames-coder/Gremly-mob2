# People Tab Implementation

## Overview
Phase 7 Hub feature: People tab with basic list showing names, emails, and linked item counts. Linking UI deferred to future phase.

## Components

### PeopleList (`components/people/PeopleList.tsx`)
**Purpose:** Display people with linked item count badges

**Type Extensions:**
```typescript
export interface PersonWithCounts extends Person {
  linkedCounts: {
    habits: number;
    todos: number;
    notes: number;
    journal: number;
  };
}
```

**Props:**
- `people: PersonWithCounts[]` - Array of people with computed counts
- `onPersonPress?: (person: PersonWithCounts) => void` - Optional callback for person tap
- `testID?: string` - Base test ID for component

**Features:**
- **Avatar Display:** Shows emoji avatar or fallback to initials in colored circle
- **Contact Info:** Name (bold) + optional email (gray)
- **Count Badges:** Displays linked counts in format "2 To-Dos · 1 Note"
- **Empty State:** "No people added yet" message when list is empty
- **Touchable:** Optional onPress handler for future navigation

**Badge Format:**
- Only shows counts > 0
- Pluralized labels (e.g., "1 Habit" vs "2 Habits")
- Separated by " · " (middle dot with spaces)
- Teal color for visual consistency

**Styling:**
```typescript
personCard: {
  flexDirection: 'row',
  padding: spacing.md,
  backgroundColor: colors.white,
  borderRadius: radii.md,
  borderWidth: 1,
  borderColor: colors.gray200,
  gap: spacing.md,
}

avatarPlaceholder: {
  width: 48, height: 48,
  borderRadius: 24,
  backgroundColor: colors.deepTeal,
  // Shows first letter of name
}

badges: {
  color: colors.deepTeal,
  fontSize: 12,
  marginTop: 2,
}
```

**TestIDs:**
- Container: `{testID}` (e.g., "people-list")
- Empty state: `{testID}-empty`
- Individual rows: `person-{person.id}`

## Data Flow

### Count Computation (HubScreen.tsx)
**Phase 7 Approach:** Client-side count computation using stub API

```typescript
// State
const [peopleWithCounts, setPeopleWithCounts] = useState<PersonWithCounts[]>([]);

// In load() function when tab === 'People'
const allPeople = await repo.listPeople();

// Compute counts (currently returns 0 since listLinkedPeople is stub)
const peopleWithCountsData: PersonWithCounts[] = await Promise.all(
  allPeople.map(async (person) => {
    const linkedHabits = await repo.listLinkedPeople({ type: 'habit', id: person.id });
    const linkedTodos = await repo.listLinkedPeople({ type: 'todo', id: person.id });
    const linkedJournal = await repo.listLinkedPeople({ type: 'note', id: person.id });
    const linkedNotes = await repo.listLinkedPeople({ type: 'note', id: person.id });

    return {
      ...person,
      linkedCounts: {
        habits: linkedHabits.length,
        todos: linkedTodos.length,
        journal: linkedJournal.length,
        notes: linkedNotes.length,
      },
    };
  }),
);

setPeopleWithCounts(peopleWithCountsData);
```

**Future Implementation:**
When `entity_people` table is implemented:
1. `listLinkedPeople()` will query actual relationships
2. Counts will reflect real links between people and items
3. No code changes needed in HubScreen - only repo implementation

## Integration

### UI Placement (HubScreen.tsx)
People tab replaces item list with PeopleList component:

```tsx
{/* People tab content */}
{tab === 'People' && !loading && (
  <View style={styles.section}>
    <Text style={[typeStyles.h2, { marginBottom: spacing.md }]}>People</Text>
    <PeopleList
      people={peopleWithCounts}
      onPersonPress={(person) => {
        // Future: Navigate to person detail view
        console.log('[HubScreen] Person pressed:', person.name);
      }}
      testID="people-list"
    />
  </View>
)}
```

**Conditional Rendering:**
- Only shown when `tab === 'People'`
- Hidden during loading state
- Uses separate state (`peopleWithCounts`) from item tabs

## Backend Support

### Current Implementation (Phase 7)
**Repo Methods:**
- `listPeople()` - Returns all people for current user ✅
- `listLinkedPeople(entity)` - **STUB:** Returns empty array ⚠️

**Stub Implementation (lib/repo/supabase.ts):**
```typescript
async listLinkedPeople(_entity: { type: EntityType; id: ID }): Promise<Person[]> {
  // Stub: Return empty array until entity_people table is implemented
  // In future: JOIN people with entity_people where entity_type and entity_id match
  return [];
}
```

**Result:** All linked counts show as 0 in Phase 7

### Future Implementation (Phase 8+)
**Database Schema (entity_people table):**
```sql
CREATE TABLE entity_people (
  id UUID PRIMARY KEY,
  person_id UUID REFERENCES people(id),
  entity_type TEXT NOT NULL,  -- 'habit' | 'todo' | 'note' | 'space'
  entity_id UUID NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Updated Query:**
```typescript
async listLinkedPeople(entity: { type: EntityType; id: ID }): Promise<Person[]> {
  const { data, error } = await this.supabase
    .from('entity_people')
    .select('person_id, people(*)')
    .eq('entity_type', entity.type)
    .eq('entity_id', entity.id);
  
  if (error) throw error;
  return data.map(row => row.people);
}
```

## Testing Strategy

### Manual Testing Checklist
- [ ] People tab renders without crashing
- [ ] Empty state shows when no people exist
- [ ] People list displays when people exist
- [ ] Avatars render correctly (emoji or initials)
- [ ] Email displays when present
- [ ] Linked count badges show (currently 0 due to stub)
- [ ] Person tap logs to console (placeholder for navigation)
- [ ] Navigation between tabs preserves people data
- [ ] Scope selector doesn't affect People tab

### Automated Tests (TODO)
Create `__tests__/people-list.test.tsx`:
- Render PeopleList with mock data
- Test empty state rendering
- Verify avatar fallback (initials)
- Test count badge formatting (pluralization)
- Test count badge visibility (only show > 0)
- Verify onPersonPress callback
- Test badge text generation logic

### TestIDs for E2E
- `people-list` - Main list container
- `people-list-empty` - Empty state message
- `person-{personId}` - Individual person rows

## Known Limitations

### Phase 7 Scope (Display Only)
- **No person creation:** Cannot add people from Hub
- **No person editing:** Cannot modify names/emails
- **No linking UI:** Cannot link people to items
- **Stub counts:** All linked counts show 0 (listLinkedPeople returns [])
- **No detail view:** Person tap only logs (no navigation)

### Future Enhancements (Phase 8+)
- Person creation flow
- Person detail view with linked items
- Link/unlink people to items UI
- Person search and filtering
- Person avatars from contacts/photos
- Bulk linking operations
- Person activity timeline
- Collaborative features (shared items)

## Design Decisions

### Why Client-Side Count Computation?
- **Phase 7 Constraint:** No entity_people table yet
- **Future-Ready:** Code structure supports real counts when available
- **Performance:** Acceptable for small datasets (<100 people)
- **Simplicity:** No backend changes needed for Phase 7

### Why Separate PersonWithCounts Type?
- **Type Safety:** Explicit count structure prevents errors
- **Clarity:** Clear distinction between raw Person and display data
- **Flexibility:** Easy to extend with more computed fields

### Why Badge Format (Not Separate Chips)?
- **Space Efficiency:** Single line for all counts
- **Readability:** Clear separation with middle dot
- **Consistency:** Matches metadata patterns in other cards
- **Mobile-Friendly:** Doesn't clutter small screens

## Related Files
- `components/people/PeopleList.tsx` - Main component (new)
- `app/tabs/HubScreen.tsx` - Integration and count computation
- `lib/types.ts` - Person, EntityPerson types
- `lib/repo/IRepo.ts` - listPeople(), listLinkedPeople() interface
- `lib/repo/supabase.ts` - Stub implementations

## Git History
- **Commit:** feat(hub): Add People tab with linked count badges
- **Branch:** feat/catchall-hub-optimizations
- **Files Changed:** 2 (PeopleList new, HubScreen updated)
- **Lines:** +189 insertions, -18 deletions

## Next Steps
1. **Test with real data:** Add sample people via database
2. **Implement entity_people table:** Enable real linking
3. **Update listLinkedPeople():** Query actual relationships
4. **Add person detail view:** Navigate on tap
5. **Build linking UI:** Add/remove people from items
6. **Person management:** Create/edit/delete flows
