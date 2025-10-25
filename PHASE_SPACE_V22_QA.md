# Space v2.2 QA Checklist

Status: Ready for manual QA
Flag: EXPO_PUBLIC_SPACE_V22=on
Scope: Space Home (v2.2 band + timeline + adaptive summary + overlays + threads)

## Pre-flight
- [ ] Set feature flag EXPO_PUBLIC_SPACE_V22=on (env or Expo config)
- [ ] Ensure user signed in and at least one Space exists
- [ ] Optional: Backend = Supabase for realtime and chat summaries

## Header (Moss band)
- [ ] Shows Space name centered, last visited subtitle below
- [ ] Back, Search, and Settings icons visible and tappable
- [ ] No emojis; lucide icons only; colors match Moss/Linen/Sage tokens
- [ ] Dark mode renders legible text and icons

## Week Strip (timeline overview)
- [ ] Shows 7 days starting current week; today highlighted
- [ ] Selected day indicator updates on tap
- [ ] Dots/badges reflect if day has any items
- [ ] “Open timeline” action opens full Timeline overlay

## Day Panel (focused day)
- [ ] Habits render as title + 0–3 blocks; no 0% or guilt copy when empty
- [ ] To-dos render as checkbox + title, strikethrough when done
- [ ] Tapping habit/todo toggles completion
- [ ] On first mark-complete: micro confetti plays for ≤400ms
- [ ] An Undo snackbar (Sage background) appears with an Undo button
- [ ] Undo reverts the completion and UI updates
- [ ] No emojis in any copy; colors match v22 tokens

## Adaptive Summary
- [ ] Renders intent-based friendly copy (habit/trip/goal/other)
- [ ] No numeric guilt (“0%”, “nothing here”) in default copy
- [ ] Primary/secondary actions are tappable (can be placeholders)
- [ ] Dark mode colors look balanced

## Insights Row / Overlays
- [ ] Tapping Notepad opens overlay with notes list and simple editor
- [ ] Tapping People opens overlay (list or placeholder) without errors
- [ ] Tapping Timeline opens grouped days and items
- [ ] Selecting a date in Timeline jumps the Week Strip selection and closes overlay

## New Chat CTA
- [ ] Button available; creates a chat scoped to current space
- [ ] Navigates to thread on create; returns updates list upon back

## Threads (Recent chats)
- [ ] Shows last three chats with title, snippet, and last active date
- [ ] Overflow/menu supports Archive and Delete; list refreshes
- [ ] If Supabase backend, archive is soft; otherwise delete fallback
- [ ] No emojis in thread UI; typography and spacing consistent

## Dark Mode
- [ ] Header, Week Strip, Day Panel, Summary, Insights, and Threads readable
- [ ] Backgrounds use Moss/Deep/Sage appropriately; no low-contrast text

## Feature Flag Gating
- [ ] With EXPO_PUBLIC_SPACE_V22=off: legacy layout renders; v22 UI hidden
- [ ] With flag on: v22 sections render (HeaderV22, WeekStrip, DayPanel, Summary, Insights, CTA, Threads)

## Realtime & Data Refresh
- [ ] Completing/undoing items refreshes counts and timeline quickly
- [ ] Threads list updates after archive/delete

## Accessibility
- [ ] Interactive elements have roles/labels
- [ ] Undo, Search, Back, Settings are accessible

Notes:
- Confetti duration is intentionally subtle (≈350ms)
- Undo snackbar is Sage with Deep text; disappears after ~2s if unused
