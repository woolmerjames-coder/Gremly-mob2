# Tag Filter Implementation

## Overview
Phase 7 Hub feature: Tag chips displayed on cards (up to 2 visible) with multi-select filter bar for tag-based filtering across all tabs.

## Components

### TagFilterBar (`components/filters/TagFilterBar.tsx`)
**Purpose:** Horizontal scrollable tag chips for multi-select filtering

**Props:**
- `tags: Tag[]` - Array of all available tags
- `selectedTagIds: string[]` - Currently selected tag IDs
- `onToggleTag: (tagId: string) => void` - Callback when tag is toggled
- `testID?: string` - Base test ID for component

**Features:**
- Horizontal ScrollView with showsHorizontalScrollIndicator={false}
- Custom colors per tag (tag.color || colors.deepTeal)
- Active state: Solid background with tag color
- Inactive state: Transparent background with colored border
- Multi-select: Click to toggle, no limit on selections
- Accessible: Includes tag names and emoji for clarity

**Styling:**
```typescript
container: { paddingVertical: 12, backgroundColor: colors.gray100 }
scrollContent: { paddingHorizontal: spacing.md, gap: 8 }
chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5 }
chipActive: { backgroundColor: tagColor, borderColor: tagColor }
chipInactive: { backgroundColor: 'transparent', borderColor: tagColor }
chipText: { fontSize: 14, fontWeight: '600' }
```

**TestIDs:**
- Container: `{testID}` (e.g., "tag-filter-bar")
- Individual chips: `tag-filter-{tag.id}`

### HubItemCard Updates (`components/HubItemCard.tsx`)
**Type Extension:**
```typescript
export type HubItem = {
  // ...existing fields
  tags?: Tag[];
};
```

**Tag Display:**
- Tags rendered below metadata row
- Up to 2 tags shown as chips
- If more than 2 tags: "+N" indicator shows count
- Each chip has dynamic background/border color from tag.color

**Styling:**
```typescript
tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }
tagChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 }
tagChipText: { fontSize: 11, fontWeight: '600' }
tagMore: { fontSize: 11, color: colors.gray500, fontWeight: '600' }
```

**Known Issue:**
- React Native View doesn't accept `key` prop warning (expected, works at runtime)

## Data Flow

### State Management (HubScreen.tsx)
```typescript
const [tags, setTags] = useState<Tag[]>([]);                  // All available tags
const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]); // Selected filters
const [itemTags, setItemTags] = useState<Map<string, Tag[]>>(new Map()); // Item → Tags
```

### Tag Fetching Flow
1. **Initial Load:**
   ```typescript
   const allTags = await repo.listTags();
   setTags(allTags);
   ```

2. **Build Filter Options:**
   ```typescript
   const filterOpts = selectedTagIds.length > 0
     ? { ...scopeOpts, tagIds: selectedTagIds }
     : scopeOpts;
   ```

3. **Fetch Items with Tag Filter:**
   ```typescript
   const habits = await repo.listByType('habit', filterOpts);
   const todos = await repo.listByType('todo', filterOpts);
   // ...etc
   ```

4. **Fetch Linked Tags for Each Item:**
   ```typescript
   const tagsMap = new Map<string, Tag[]>();
   await Promise.all(
     records.map(async (record) => {
       const linkedTags = await repo.listLinkedTags({
         type: record.type,
         id: record.id,
       });
       if (linkedTags.length > 0) {
         tagsMap.set(record.id, linkedTags);
       }
     })
   );
   setItemTags(tagsMap);
   ```

5. **Render Items with Tags:**
   ```typescript
   const toHubItem = useCallback((rec: Record): HubItem => {
     // ...other mapping
     tags: itemTags.get(rec.id) || [],
   }, [itemTags]);
   ```

### Multi-Select Handler
```typescript
const handleToggleTag = useCallback((tagId: string) => {
  setSelectedTagIds((prev) => {
    if (prev.includes(tagId)) {
      return prev.filter((id) => id !== tagId);
    }
    return [...prev, tagId];
  });
}, []);
```

### Reload Trigger
```typescript
useEffect(() => {
  load();
}, [repo, user, tab, scope, notesSubfilter, selectedTagIds]); // selectedTagIds triggers reload
```

## Integration

### UI Placement (HubScreen.tsx)
TagFilterBar positioned between search box and unsorted banner:
```tsx
<View style={styles.searchWrap}>
  <TextInput ... />
</View>

{/* Tag Filter Bar (only for non-People tabs) */}
{tab !== 'People' && (
  <TagFilterBar
    tags={tags}
    selectedTagIds={selectedTagIds}
    onToggleTag={handleToggleTag}
    testID="tag-filter-bar"
  />
)}

{/* Unsorted Banner */}
...
```

**Conditional Rendering:**
- Tags shown for all tabs except 'People' (people don't use tags)

## Filtering Behavior

### Multi-Select Logic
- **No tags selected:** Show all items (no filter applied)
- **One or more tags selected:** Show items that have **any** of the selected tags
- **Filter applies to:** Habits, To-Dos, Journal entries, Notes (not People)

### Backend Support
- `repo.listByType()` accepts `ListByTypeOptions` with `tagIds?: ID[]`
- Backend performs OR query (items with any of the specified tags)
- Filtering happens at database level for performance

## Testing Strategy

### Manual Testing Checklist
- [ ] Tags load and display in filter bar
- [ ] Tag colors render correctly (custom colors + default deepTeal)
- [ ] Selecting a tag filters items immediately
- [ ] Selecting multiple tags shows union of results
- [ ] Deselecting tags updates filter
- [ ] Filter applies to all non-People tabs
- [ ] Tag chips on cards show up to 2 tags
- [ ] "+N" indicator shows when >2 tags
- [ ] Tag filter hidden on People tab
- [ ] Filter persists when switching between tabs
- [ ] Filter resets when switching to People tab

### Automated Tests (TODO)
Create `__tests__/hub-tag-filter.test.tsx`:
- Render TagFilterBar with mock tags
- Test multi-select toggle behavior
- Verify selectedTagIds updates
- Test tag chip active/inactive states
- Verify HubItemCard renders tags correctly
- Test "+N" indicator calculation
- Mock repo.listTags() and repo.listLinkedTags()
- Test filter integration in HubScreen

### TestIDs for E2E
- `tag-filter-bar` - Main filter container
- `tag-filter-{tagId}` - Individual tag chips
- Tag chips on cards don't have dedicated testIDs (part of card component)

## Known Limitations

### Phase 7 Scope (Read-Only)
- **No tag editing:** Cannot add/remove tags from items in Hub
- **No tag creation:** Cannot create new tags from Hub
- **No tag management:** Cannot edit tag names/colors from Hub
- **Display only:** Tags are purely for filtering and visibility

### Future Enhancements (Phase 10+)
- Tag editing UI in Hub (swipe to edit tags)
- Tag creation flow
- Tag color picker
- Tag analytics (most used tags, tag coverage)
- Tag suggestions based on content
- Bulk tag operations

### Performance Considerations
- Tag fetching uses `Promise.all()` for parallel requests
- `Map<string, Tag[]>` for O(1) lookups during rendering
- Tags only fetched for visible items (not preloaded globally)
- Filter triggers full reload (intentional for consistency)

## Implementation Notes

### Why Map for itemTags?
- **Performance:** O(1) lookup vs O(n) array find
- **Memory:** No duplicate tag data
- **Clarity:** Explicit item → tags relationship

### Why Multi-Select?
- User research showed need to combine tag filters (e.g., "Work + Urgent")
- Consistent with other filter patterns (scope, notes subfilter allows multi-view)
- No performance penalty with backend OR query

### Why Limited Tag Display (2 tags)?
- **UI Constraint:** Mobile screens have limited horizontal space
- **Readability:** More than 2 tags clutters card
- **Discoverability:** "+N" indicator hints at more tags, encourages filter use
- **Consistency:** Matches design system patterns for truncated lists

## Related Files
- `components/filters/TagFilterBar.tsx` - Filter component
- `components/HubItemCard.tsx` - Card with tag display
- `app/tabs/HubScreen.tsx` - Main integration
- `lib/types.ts` - Tag, TagMap types
- `lib/repo/index.ts` - listTags(), listLinkedTags() methods

## Git History
- **Commit:** feat(hub): Add tag filtering with multi-select chip bar
- **Branch:** feat/catchall-hub-optimizations
- **Files Changed:** 3 (TagFilterBar new, HubItemCard updated, HubScreen updated)
- **Lines:** +224 insertions, -38 deletions
