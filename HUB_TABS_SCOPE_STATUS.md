# Hub Tabs & Scope Selector Implementation - Status

## ✅ Completed Changes

### 1. ScopeSelector Component (`components/ScopeSelector.tsx`)
- ✅ Created new component with "Everywhere ▾" dropdown
- ✅ Supports three scope types:
  - `everywhere`: All items across all spaces
  - `space`: Items in a specific space (with name + icon)
  - `unassigned`: Only items with space_id = null
- ✅ Modal dropdown with space list
- ✅ TestIDs for all options (`scope-everywhere`, `scope-space-{id}`, `scope-unassigned`)
- ✅ Brand styling matching theme tokens

### 2. SegmentedTabs Update (`components/SegmentedTabs.tsx`)
- ✅ Changed tab type from `'All' | 'Habits' | 'To-Dos' | 'Journal' | 'Catch-All'`
- ✅ To new structure: `'Habits' | 'To-Dos' | 'Journal' | 'Notes' | 'People'`
- ✅ Removed "All" and "Catch-All" from tabs

### 3. HubScreen Major Rewrite (`app/tabs/HubScreen.tsx`)
- ✅ Added imports: `ScopeSelector`, `Space`, `Person` types
- ✅ Added state:
  - `scope: ScopeOption` - tracks selected scope
  - `spaces: Space[]` - list of spaces for dropdown
  - `people: Person[]` - for People tab
- ✅ Updated `load()` function:
  - Loads spaces via `repo.listSpaces()`
  - Builds scope options based on `scope.type` and `scope.spaceId`
  - Routes by tab:
    - **Habits**: `repo.listByType('habit', scopeOpts)`
    - **To-Dos**: `repo.listByType('todo', scopeOpts)`
    - **Journal**: `repo.listByType('note', { ...scopeOpts, subtypes: ['journal'] })`
    - **Notes**: `repo.listByType('note', { ...scopeOpts, subtypes: ['idea', 'list', 'reference'] })`
    - **People**: `repo.listPeople()`
- ✅ Removed old filter logic (`filteredByTab` based on tab === 'All', etc.)
- ✅ Updated UI:
  - Added ScopeSelector before tabs
  - Changed section header from "Everything" to show current tab name
  - Added People tab rendering with person cards (name, email, avatar)
  - Added person card styles (avatar, flex layout)

## ⚠️ Known Issues

### Parse Error
- Jest tests failing with Babel parse error in HubScreen.tsx
- Likely related to React.Fragment usage in People map
- TypeScript compilation shows no structural errors, only JSX flag warnings (expected during dev)

### ManualAddOverlay Subtype Mismatch
- Error: `Type 'NoteSubtype | undefined' is not assignable to type '"journal" | "list" | "catchall" | undefined'`
- Cause: ManualAddOverlay doesn't support new subtypes ('idea', 'reference')
- Location: Line 445 in HubScreen.tsx
- Fix needed: Update ManualAddOverlay types to accept full NoteSubtype union

## 🔧 Next Steps

1. **Fix Parse Error**:
   - Debug React.Fragment usage in People rendering
   - Consider using FlatList for people instead of map
   - Or simplify to basic conditional rendering without fragments

2. **Update ManualAddOverlay**:
   - Find ManualAddOverlay type definition
   - Update `initialSubtype` prop to accept `NoteSubtype` instead of limited union
   - Or add type casting in HubScreen

3. **Update Tests**:
   - Update `__tests__/hub.ds.test.tsx` to match new tab structure
   - Change testIDs from `tab-all`, `tab-catch-all` to `tab-habits`, `tab-notes`, `tab-people`
   - Update assertions for scope selector
   - Add tests for scope filtering behavior

4. **Add Space Chip Display** (Optional):
   - When `scope.type === 'everywhere'`, show "Lives in {Space}" chip on item cards
   - Update HubItemCard to accept `spaceInfo?: { id: string, name: string, icon?: string }` prop
   - Hide chip when specific space is selected

## 📝 Implementation Notes

- Scope selector persists in component state only (not localStorage yet)
- People tab shows empty state when `people.length === 0`
- "Needs Sorting" section still shows regardless of scope (shows all ai_placed items)
- Search functionality works across all tabs except People

## 🎯 Acceptance Criteria Status

- ✅ Tabs replaced with: Habits | To-Dos | Journal | Notes | People
- ✅ Scope selector shows "Everywhere ▾" with dropdown
- ✅ Dropdown has: Everywhere, Spaces list, Unassigned only
- ✅ Scope state persisted in component
- ✅ Repo list calls use `{ spaceId, unassignedOnly }` options
- ✅ Tab routes to correct repo method with subtype filters
- ⚠️ Tests need updating (parse error blocking)
- ⚠️ Space chip display not yet implemented (optional feature)
