# Space v22 Components Plan (no code yet)

Planned files to touch for the v22 calm/adaptive iteration. This is a scaffolding plan only; no implementation here per request.

- app/spaces/SpaceHomeScreen.tsx (integration wiring only when implementing)
- components/spaces/v22/Header.tsx (Moss band header, subtext)
- components/spaces/v22/WeekStrip.tsx (7-day strip, Pear ring)
- components/spaces/v22/DayPanel.tsx (focused day panel with entries)
- components/spaces/v22/AdaptiveSummary.tsx (one-line adaptive summary)
- components/spaces/v22/InsightsRow.tsx (chips/cards for insights)
- components/spaces/v22/NewPlusFAB.tsx (global + FAB)
- components/spaces/v22/NewChatCTA.tsx (primary outlined CTA)
- components/spaces/v22/ThreadCard.tsx (compact chat/reflection card)
- components/spaces/v22/Overlays/TimelineOverlay.tsx (unified timeline overlay)
- components/spaces/v22/Overlays/NotepadOverlay.tsx (quick note overlay)
- components/spaces/v22/Overlays/PeopleOverlay.tsx (people/mentions)
- components/icons/index.ts (brand Lucide set export map)
- components/spaces/v22/_tokens.ts (brand constants for v22)

Notes
- Keep implementation minimal and calm; prefer outlined surfaces, subtle motion.
- Use lucide-react-native for icons.
- Avoid 0% or empty metrics; hide chips when zero.
- Ensure accessibility roles/labels for interactive elements.
