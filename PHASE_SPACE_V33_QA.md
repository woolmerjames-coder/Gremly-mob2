# Space v3.3 (Sage) QA Checklist

Use this checklist to validate the v3.3 Space Home experience when `EXPO_PUBLIC_SPACE_V33 === 'on'`. When the flag is not set to `on`, the app must render the prior layout.

## Visual and layout
- [ ] Sage header renders with space name
- [ ] Mood line under header shows contextual copy
- [ ] Subtle divider under header

## Search overlay
- [ ] Opens as a slide-down under the header
- [ ] Filter chips switch dataset (Chats / Notes / Habits)
- [ ] Local search shows results; empty states show calm copy
- [ ] Overlay closes on Esc and blur

## Icon Row
- [ ] Icons centered; appropriate badges visible
- [ ] Add/New flows available from row
- [ ] Former FAB has been removed

## Goals
- [ ] Stacked Goal Cards (max 3) visible
- [ ] Kebab menus on goals expose: Edit, Pause/Resume, Delete, View Chat Context
- [ ] Edit opens 80% glass Edit Goal modal; Save updates goal and shows toast

## Calendar overlay
- [ ] Opens as 90% glass bottom sheet with fade-up motion (≈250ms)
- [ ] Month grid with selected day; mini weekly summary visible
- [ ] Weekly and daily entries list render
- [ ] Milestones: add/edit/delete works; Pear dots appear on days with milestones

## Chat section
- [ ] "Start a New Chat" section present with updated copy
- [ ] Button has press sink (2px) and tint
- [ ] Recent chats (last 3) render with AI-generated titles

## Empty states & motion
- [ ] Goals empty: "All clear — nothing pressing in this Space."
- [ ] Recent chats empty: "No conversations yet — want to ask Gremly something?"
- [ ] Page entrance animation (fade + slide ~250ms)
- [ ] Menu open animation (fade + scale ~200ms)

## Brand and accessibility
- [ ] No emojis; brand icons only
- [ ] Dark mode: text and divider contrast sufficient; Pear/Moss/Sage colors legible

## Feature gating
- [ ] With `EXPO_PUBLIC_SPACE_V33 !== 'on'`, app renders prior layout (no v3.3 UI)
