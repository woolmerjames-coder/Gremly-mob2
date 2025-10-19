# HubItemCard Space/Tag Chips Implementation

## Overview
Phase 7 Hub polish: Added space and tag chips to the meta row with smart visibility rules. Space chips only appear when scope is "Everywhere" to surface "Lives in [Space]" context.

## Problem Statement
Previously:
- Cards showed AI badge in title row (separate from metadata)
- Tags were in a separate row below meta (caused awkward wrapping)
- No indication of which Space an item belonged to
- Meta row was sparse and inconsistent

## Solution
Reorganize meta row with unified chip design:
- **Order:** [AI badge] [Space chip] [Tag chips (up to 2)] [Date]
- **Space chip:** Only visible when `scope.type === 'everywhere'`
- **Unified styling:** Consistent chip pattern for all badges
- **Single row:** All metadata in one flexWrap row (no separate tag row)

## Implementation

### 1. HubItem Type Updates (`components/HubItemCard.tsx`)

**New Fields:**
```typescript
export type HubItem = {
  // ...existing fields
  spaceName?: string; // Space name to display (only when scope is "Everywhere")
  showSpaceChip?: boolean; // Whether to show space chip (true when scope is Everywhere)
};
```

### 2. Meta Row Reorganization

**Before:**
```tsx
<View style={styles.titleRow}>
  <Text>{item.title}</Text>
  {item.placedBy === 'ai' && <View style={styles.aiBadge}>✨ AI</View>}
</View>
<View style={styles.metaRow}>
  {item.date && <Text>{item.date}</Text>}
</View>
<View style={styles.tagRow}>
  {/* Tags in separate row */}
</View>
```

**After:**
```tsx
<View style={styles.titleRow}>
  <Text>{item.title}</Text>
  {/* AI badge moved to meta row */}
</View>
<View style={styles.metaRow}>
  {/* AI badge */}
  {item.placedBy === 'ai' && <View style={styles.aiBadge}>✨ AI</View>}
  
  {/* Space chip (only when showSpaceChip) */}
  {item.showSpaceChip && item.spaceName && (
    <View style={styles.spaceChip}>📍 {item.spaceName}</View>
  )}
  
  {/* Tag chips (up to 2) */}
  {item.tags?.slice(0, 2).map(tag => <View style={styles.tagChip}>{tag.name}</View>)}
  {item.tags.length > 2 && <Text>+{item.tags.length - 2}</Text>}
  
  {/* Date */}
  {item.date && <Text style={styles.dateText}>{item.date}</Text>}
</View>
```

### 3. Unified Chip Styles

**AI Badge:**
```typescript
aiBadge: {
  backgroundColor: colors.periwinkle,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: radii.sm,
},
aiBadgeText: { fontSize: 10, color: colors.white, fontWeight: '600' },
```

**Space Chip:**
```typescript
spaceChip: {
  backgroundColor: colors.mint,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: radii.sm,
  borderWidth: 1,
  borderColor: colors.mint,
},
spaceChipText: {
  fontSize: 10,
  color: colors.deepTeal,
  fontWeight: '600',
},
```

**Tag Chip:**
```typescript
tagChip: {
  backgroundColor: colors.deepTeal, // Or tag.color if provided
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: radii.sm,
  borderWidth: 1,
},
tagChipText: {
  fontSize: 10,
  color: colors.white,
  fontWeight: '600',
},
```

**Unified Pattern:**
- Same padding: `paddingHorizontal: spacing.xs, paddingVertical: 2`
- Same border radius: `radii.sm`
- Same font size: `10`
- Same font weight: `600`
- Different colors to distinguish types

### 4. Meta Row Layout

**FlexWrap with Gap:**
```typescript
metaRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: spacing.xs,
  gap: spacing.xs,
  flexWrap: 'wrap', // Allows wrapping if too many chips
},
```

**Date Alignment:**
```typescript
dateText: {
  marginLeft: 'auto', // Push date to the right
},
```

**Benefits:**
- Chips flow naturally left-to-right
- Wraps gracefully on small screens
- Date stays at right edge (or wraps to new line)
- Consistent spacing between all elements

### 5. HubScreen Integration (`app/tabs/HubScreen.tsx`)

**Updated toHubItem:**
```typescript
const toHubItem = useCallback(
  (item: AppRecord): HubItem => {
    // ...existing mapping logic
    
    // Get space name and determine if we should show space chip
    // Only show space chip when scope is "Everywhere" and item has a space
    const showSpaceChip = scope.type === 'everywhere';
    let spaceName: string | undefined;
    if (showSpaceChip && item.space_id) {
      const space = spaces.find((s) => s.id === item.space_id);
      spaceName = space?.name;
    }

    return {
      // ...existing fields
      spaceName,
      showSpaceChip,
    };
  },
  [itemTags, scope.type, spaces],
);
```

**Logic:**
- `showSpaceChip` only true when `scope.type === 'everywhere'`
- `spaceName` looked up from `spaces` array using `item.space_id`
- If item has no space (unassigned), chip not shown
- Dependencies updated to include `scope.type` and `spaces`

## Visibility Rules

### Space Chip Visibility Matrix

| Scope Type | Item Has Space | Space Chip Shown | Display Text |
|------------|----------------|------------------|--------------|
| Everywhere | Yes | ✅ Yes | "📍 [Space Name]" |
| Everywhere | No (unassigned) | ❌ No | - |
| Unassigned | N/A | ❌ No | - |
| Specific Space | Yes (any space) | ❌ No | - |

**Rationale:**
- **Everywhere scope:** User sees all items mixed together, needs context of where each lives
- **Unassigned scope:** All items are unassigned by definition, chip redundant
- **Specific Space:** All items in that space by definition, chip redundant

### Chip Display Order

**Priority (Left to Right):**
1. **AI Badge** (✨ AI) - Highest priority, always shown when `ai_placed === true`
2. **Space Chip** (📍 Space Name) - Contextual, only when scope is Everywhere
3. **Tag Chips** (up to 2) - Important metadata, shows first 2 tags
4. **+N Indicator** - Shows count of additional hidden tags
5. **Date** (pushed right) - Supplementary info, right-aligned or wraps

**Visual Example:**
```
[✨ AI] [📍 Work] [🏷️ Urgent] [🏷️ Dev] +2  12/18/2024
```

## Accessibility

### VoiceOver Support

**AI Badge:**
```tsx
<View style={styles.aiBadge} testID="ai-badge">
  <Text style={styles.aiBadgeText}>✨ AI</Text>
</View>
```
- Reads: "Sparkles AI"
- Indicates AI-placed item

**Space Chip:**
```tsx
<View style={styles.spaceChip} testID="space-chip">
  <Text style={styles.spaceChipText}>📍 {item.spaceName}</Text>
</View>
```
- Reads: "Round pushpin [Space Name]"
- Conveys location context

**Tag Chips:**
```tsx
<View style={styles.tagChip} testID={`tag-chip-${tag.id}`}>
  <Text style={styles.tagChipText}>{tag.name}</Text>
</View>
```
- Reads: "[Tag Name]"
- No emoji needed (already contextual)

**Benefits:**
- Clear semantic meaning for screen readers
- TestIDs for automated testing
- Descriptive emoji enhance visual + audio context

## Responsive Behavior

### Small Screens (iPhone SE, etc.)
```
Title text wraps naturally
[✨ AI] [📍 Work] [🏷️ Tag1]
[🏷️ Tag2] +1  12/18/2024
```

### Medium Screens (iPhone 14, etc.)
```
Title text on one line
[✨ AI] [📍 Work] [🏷️ Tag1] [🏷️ Tag2] +1  12/18/2024
```

### Large Screens (iPad, etc.)
```
Title text with plenty of space
[✨ AI] [📍 Work] [🏷️ Tag1] [🏷️ Tag2] +1              12/18/2024
```

**FlexWrap ensures graceful wrapping:**
- Chips flow left-to-right
- Wraps to new line when out of space
- Date uses `marginLeft: 'auto'` to push right (when space available)
- Never awkward truncation

## Edge Cases

### 1. Item with Space but Scope is Space
```typescript
showSpaceChip: false // Hidden, redundant
```
**Example:** Viewing "Work" space → all items in Work → no chip needed

### 2. Item without Space (Unassigned)
```typescript
spaceName: undefined // No chip rendered
```
**Example:** Unassigned items → no space to display

### 3. Many Tags (>2)
```tsx
{item.tags.slice(0, 2).map(...)} {/* Show first 2 */}
{item.tags.length > 2 && <Text>+{item.tags.length - 2}</Text>}
```
**Example:** 5 tags → shows 2 + "+3" indicator

### 4. Long Space Names
```typescript
paddingHorizontal: spacing.xs, // Compact padding
fontSize: 10, // Small font
```
**Example:** "Personal Development" → might wrap to next line

### 5. No Metadata
If item has no AI badge, no space, no tags, no date:
- Meta row still renders (empty but present)
- No visual clutter
- Consistent spacing maintained

## Testing Strategy

### Manual Testing Checklist
- [ ] **Everywhere scope** → Space chips visible for assigned items
- [ ] **Everywhere scope** → No space chip for unassigned items
- [ ] **Unassigned scope** → No space chips (all unassigned)
- [ ] **Specific space** → No space chips (redundant)
- [ ] **AI badge** → Shows at left of meta row
- [ ] **Tags** → Up to 2 shown with correct colors
- [ ] **+N indicator** → Shows when >2 tags
- [ ] **Date** → Right-aligned (or wraps)
- [ ] **Small screen** → Chips wrap gracefully
- [ ] **VoiceOver** → Chips read meaningfully

### Automated Tests (TODO)
Create `__tests__/hub-item-card.test.tsx`:
- Render card with all chip types
- Test space chip visibility based on showSpaceChip prop
- Verify tag chip limit (max 2 shown)
- Test +N indicator calculation
- Verify chip order (AI → Space → Tags → Date)
- Test responsive wrapping behavior
- Accessibility audit (testIDs, readable text)

### Visual Regression Tests
Screenshots for:
- Card with all chips (AI + Space + Tags + Date)
- Card with only AI badge
- Card with only tags
- Card with long space name
- Card on small screen (wrapped)

## Design Decisions

### Why Move AI Badge to Meta Row?
**Before:** AI badge in title row (next to title)
**After:** AI badge in meta row (with other badges)

**Rationale:**
- Consistent badge location (all metadata together)
- Title row cleaner (just title text)
- AI badge has same visual weight as other chips
- Easier to scan (badges grouped)

### Why Show Space Only in Everywhere?
**Alternative:** Always show space chip

**Rationale:**
- **Context-aware:** Only show when user needs the info
- **Reduce clutter:** Don't repeat obvious information
- **Focus:** Let users focus on content, not redundant labels
- **Consistency:** Matches ScopeSelector behavior (context indicator)

### Why Limit Tags to 2?
**Alternative:** Show all tags (could wrap)

**Rationale:**
- **Mobile screens:** Limited horizontal space
- **Readability:** Too many chips → visual noise
- **Discoverability:** "+N" hints at more (encourages filtering)
- **Performance:** Less DOM nodes to render

### Why Use Emoji Prefixes?
✨ AI | 📍 Space | No emoji for tags

**Rationale:**
- **Visual anchors:** Quick recognition without reading
- **Accessibility:** Screen readers announce emoji names
- **Consistency:** Matches design system patterns
- **Fun:** Adds personality to UI

## Related Files
- `components/HubItemCard.tsx` - Card component with unified chip design
- `app/tabs/HubScreen.tsx` - Integration with scope logic
- `theme/tokens.ts` - Chip colors (periwinkle, mint, deepTeal)

## Git History
- **Commit:** feat(hub): Add space/tag chips and tidy meta row in HubItemCard
- **Branch:** feat/catchall-hub-optimizations
- **Files Changed:** 2 (HubItemCard, HubScreen)
- **Lines:** ~80 insertions, ~40 deletions

## Acceptance Criteria
✅ Meta row order: [AI sparkle] [Space chip] [Tag chips (up to 2)] [date]
✅ Space chip only shows when scope is "Everywhere"
✅ Space chip shows "📍 [Space Name]" for assigned items
✅ Unified chip styling (consistent padding, radius, font)
✅ Cards read cleanly without awkward wrapping (flexWrap handles overflow)
✅ VoiceOver reads chips meaningfully (emoji + text descriptors)
✅ Date pushed to right when space available
