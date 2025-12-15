# Search/Hub Implementation Checklist

> Implementation checklist for the final Search/Hub spec (December 2024 revamp)

---

## Phase 1: Hub Mode – Core Structure

### 1.1 Hub Screen Layout
- [ ] Hub screen exists at `app/tabs/HubScreen.tsx`
- [ ] Top bar contains search input field
- [ ] Search input has placeholder text "Search your mind..."
- [ ] Search input has search icon (left) and clear button (right, when has text)
- [ ] Tapping search input transitions to Search Mode

### 1.2 Hub Mode Sections (Idle State)
- [ ] **"So you don't forget…"** section at top (needs-attention items)
  - [ ] Shows todos missing due date (stale > 3 days)
  - [ ] Shows ideas stale > 7 days without space
  - [ ] Max 5 items, sorted by staleness DESC
  - [ ] Empty state hidden (section not rendered if no items)
- [ ] **Recent Journals** horizontal rail
  - [ ] Shows last 5 journal entries
  - [ ] Horizontal scroll, card-style thumbnails
  - [ ] Tapping opens journal in overlay
- [ ] **Popular Tags** section (capped at 5)
  - [ ] Shows top 5 most-used tags
  - [ ] Tapping tag filters Hub to that tag
  - [ ] Hidden if user has no tags
- [ ] **Browse by Space** section (secondary)
  - [ ] Lists user's spaces as cards/buttons
  - [ ] Tapping space navigates to SpaceHome
  - [ ] "No Space" option for unassigned items
- [ ] **Archived** drawer/expandable section
  - [ ] Collapsed by default
  - [ ] Expands to show archived items count
  - [ ] Tapping opens Archived View

### 1.3 Hub Mode Item Cards
- [ ] Item cards display title/name prominently
- [ ] Item cards show type chip (TO-DO, NOTE, HABIT, JOURNAL)
- [ ] Item cards show body preview (truncated to 2 lines max)
- [ ] Item cards show relative timestamp ("2h ago", "Yesterday")
- [ ] Item cards show tag chips (max 3, "+N" for overflow)
- [ ] Tapping item card opens UnifiedOverlayV2 in edit mode
- [ ] Long-press on item shows context menu (pin/unpin, archive, delete)

### 1.4 Quick Filters Row
- [ ] Filter chips row exists below search bar
- [ ] Filter chips include: All, To-dos, Notes, Journals, Habits
- [ ] "All" filter is selected by default
- [ ] Tapping filter chip filters the Hub content
- [ ] Active filter chip has distinct visual style (filled vs outline)
- [ ] Filter state persists during session

---

## Phase 2: Search Mode – Input & Results

### 2.1 Search Mode Activation
- [ ] Tapping search bar activates Search Mode
- [ ] Keyboard appears automatically on activation
- [ ] Search mode shows full-screen search UI
- [ ] Cancel/back button exists to exit Search Mode
- [ ] Pressing Cancel returns to Hub Mode (idle)

### 2.2 Search Input Behavior
- [ ] Search is debounced (300ms delay before query)
- [ ] Typing updates results in real-time after debounce
- [ ] Clear button (X) clears input and results
- [ ] Empty input shows recent searches or suggestions
- [ ] Search query is trimmed of whitespace

### 2.3 Search Token Parsing
- [ ] `#tag` syntax filters by tag (e.g., `#work`)
- [ ] `@person` syntax filters by person mention
- [ ] `type:todo` / `type:note` / `type:habit` / `type:journal` filters by type
- [ ] `is:pinned` filters to pinned items only
- [ ] `is:archived` filters to archived items only
- [ ] Multiple tokens combine with AND logic
- [ ] Free text searches title, body, and tags
- [ ] Search is case-insensitive

### 2.4 Search Results Display
- [ ] Results grouped by type or shown in single list (configurable)
- [ ] Results show match highlights in title/body
- [ ] Results sorted by relevance (match quality + recency)
- [ ] "No results" state shows helpful message
- [ ] Results list is scrollable with smooth performance
- [ ] Loading state shows skeleton/spinner during search

### 2.5 Recent Searches
- [ ] Recent searches stored locally (last 10)
- [ ] Recent searches shown when search input is empty
- [ ] Tapping recent search populates input and runs search
- [ ] Clear all recent searches option exists
- [ ] Recent searches persist across app restarts

---

## Phase 3: Journal View

### 3.1 Journal View Access
- [ ] "Journals" filter in Hub shows journal entries
- [ ] Journal View accessible from Hub filter chips
- [ ] Journal entries are log items with `canonical_type = 'journal'`

### 3.2 Journal List Display
- [ ] Journal entries sorted by created_at DESC (newest first)
- [ ] Each entry shows date header for grouping ("Today", "Yesterday", "Dec 12")
- [ ] Entry card shows mood indicator if present
- [ ] Entry card shows body preview (first 3 lines)
- [ ] Entry card shows photo thumbnail if has attachments
- [ ] Entry card shows privacy lock icon if `private = true`

### 3.3 Journal Entry Interaction
- [ ] Tapping journal entry opens in overlay for viewing/editing
- [ ] Journal overlay shows full body with markdown rendering
- [ ] Journal overlay shows all photos in gallery view
- [ ] Journal overlay shows mood selector
- [ ] Journal overlay allows editing body text
- [ ] Save button persists changes to database

### 3.4 Journal Grouping & Timeline
- [ ] Entries grouped by day with sticky date headers
- [ ] Week separators show between different weeks
- [ ] Month label appears at first entry of each month
- [ ] Scroll position preserved when returning from overlay

---

## Phase 4: Archived View & Restore/Delete

### 4.1 Archived View Access
- [ ] Archive accessible via `is:archived` search token
- [ ] Archive accessible via Hub settings/menu
- [ ] Archive shows all archived items across types
- [ ] Archive header shows "Archived Items" title

### 4.2 Archived Items Display
- [ ] Archived items show with muted/faded visual style
- [ ] Archived items show archived_at timestamp
- [ ] Archived items show archived_reason if present
- [ ] Items grouped by type or shown chronologically
- [ ] Empty state: "No archived items"

### 4.3 Restore Functionality
- [ ] Each archived item has "Restore" action
- [ ] Restore action accessible via swipe or context menu
- [ ] Restoring sets `archived = false` and clears `archived_at`
- [ ] Restored item appears in main Hub immediately
- [ ] Toast confirms "Item restored"
- [ ] Undo option available in toast (5 second window)

### 4.4 Permanent Delete
- [ ] Each archived item has "Delete Forever" action
- [ ] Delete action shows confirmation dialog
- [ ] Confirmation states "This cannot be undone"
- [ ] Confirming delete removes item from database
- [ ] Toast confirms "Item permanently deleted"
- [ ] Deleted items cannot be recovered

### 4.5 Bulk Actions (Stretch)
- [ ] Multi-select mode for archived items
- [ ] "Restore All" button when items selected
- [ ] "Delete All" button when items selected
- [ ] Confirmation for bulk delete

---

## Phase 5: Analyze Last 30 Days (AI Insights)

### 5.1 Analyze Entry Point
- [ ] "Analyze" button exists in Journal View header
- [ ] Button shows sparkle/AI icon
- [ ] Button disabled if < 5 journal entries in 30 days
- [ ] Tooltip explains minimum entries requirement

### 5.2 Analysis Request
- [ ] Tapping Analyze shows loading state
- [ ] Loading state shows "Analyzing your entries..."
- [ ] Request sent to cortex-proxy with journal entries
- [ ] Request includes last 30 days of journal content
- [ ] Private entries excluded from analysis (or configurable)

### 5.3 Analysis Results Modal
- [ ] Results displayed in modal/bottom sheet
- [ ] Modal title: "Insights from your journal"
- [ ] Themes section lists 3-5 recurring themes
- [ ] Mood trends section shows emotional patterns
- [ ] Suggestions section provides actionable insights
- [ ] Close button dismisses modal
- [ ] Results not persisted (generated on-demand)

### 5.4 Analysis Error Handling
- [ ] Network error shows retry option
- [ ] Timeout (30s) shows error message
- [ ] Rate limit shows "Try again later"
- [ ] Empty/insufficient data shows helpful message

---

## Visual & Interaction Rules

### V.1 Color & Typography
- [ ] Uses Harmonic Cortex color palette (Moss, Sage, Golden, Linen)
- [ ] Primary text uses correct typography token
- [ ] Secondary/subtle text uses muted color
- [ ] Type chips use correct category colors
- [ ] Dark mode colors match design spec

### V.2 Spacing & Layout
- [ ] Consistent padding (16px horizontal, 12px vertical)
- [ ] Card spacing follows 8px grid
- [ ] Section headers have correct margins
- [ ] Safe area insets respected (top/bottom)

### V.3 Animations & Transitions
- [ ] Search mode transition is smooth (300ms)
- [ ] Filter chip selection animates
- [ ] Item card press has opacity feedback
- [ ] List scroll is 60fps smooth
- [ ] Overlay open/close animates correctly

### V.4 Accessibility
- [ ] All interactive elements have accessibilityLabel
- [ ] Screen reader announces section headers
- [ ] Focus order is logical (top to bottom)
- [ ] Touch targets are minimum 44x44pt
- [ ] Color contrast meets WCAG AA

### V.5 Loading & Error States
- [ ] Initial load shows skeleton placeholders
- [ ] Pull-to-refresh works on Hub
- [ ] Network error shows retry option
- [ ] Empty states have helpful messages
- [ ] Optimistic updates for local actions

---

## Testing Checkpoints

### T.1 Unit Tests
- [ ] Search token parser has test coverage
- [ ] Filter logic has test coverage
- [ ] Date grouping helpers have test coverage
- [ ] Archive/restore handlers have test coverage

### T.2 Integration Tests
- [ ] Hub renders with mock data
- [ ] Search returns correct results
- [ ] Filter chips update content
- [ ] Overlay opens from Hub item

### T.3 E2E Scenarios
- [ ] User can search and find an item
- [ ] User can filter Hub by type
- [ ] User can archive and restore an item
- [ ] User can view and edit a journal entry
- [ ] User can trigger journal analysis (if available)

---

_Last updated: December 14, 2024_
