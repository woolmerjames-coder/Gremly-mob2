# Overlay V2 smoke checklist

Quick manual QA steps for Overlay V2 — ten focused actions to validate core flows (create, details, tags, commitment, save, undo, error/retry).

1. Create a Log (note)
   - Open the overlay (global + button or keyboard shortcut).
   - Ensure "New Log" (or equivalent) is visible.
   - Type a short sentence into the main input (e.g., "Quick log smoke test").
   - Press Save.
   - Expect: overlay closes, a small saved pulse appears briefly, and the app receives a saved event.

2. Create a To-Do
   - Open overlay → switch to "To-Do" type.
   - Enter a task (e.g., "Buy milk").
   - Use "Add due date" to set Today or Tomorrow.
   - Press Save.
   - Expect: item created with due date; overlay closes.

3. Create a Habit
   - Open overlay → switch to "Habit" type.
   - Enter a habit name (e.g., "Stretch 5 min").
   - Save.
   - Expect: habit created and overlay closes.

4. Toggle Tags (Journal / List)
   - Open overlay in create mode.
   - Toggle the "Journal" tag on and off.
   - Toggle the "List" tag on and off.
   - Expect: UI reflects selected state; for Journal, mood pills appear when enabled.

5. Expand Details and pick Space / Person
   - Open overlay → press "Add details" (expand panel).
   - Use Person picker to select or add a person (if available).
   - Use Scope/Space selector to pick a space.
   - Expect: details persist in the form and are saved on Save.

6. Commitments: enable/disable with note
   - Open overlay → switch to "To-Do" or "Habit" → Expand details.
   - If commitments feature is enabled, press "Make this a commitment".
   - Enter a short commitment note and save.
   - Expect: commitment flag and note persist on the created item.
   - Toggle commitment off and verify undo behavior below.

7. Undo behavior (type/tag/commitment)
   - From an open overlay, perform a type switch (e.g., Log → To-Do).
   - Immediately look for the transient Undo toast.
   - Press Undo: expect the overlay to revert to the previous state (type, fields).
   - Repeat for toggling a tag and toggling commitment: press Undo and verify revert.

8. Save error + Retry
   - Simulate a save error (development harness or by disabling network):
     - Option A: Put app into offline mode (turn off network) and attempt to Save.
     - Option B: In test/dev repo, mock repo.create to throw once.
   - Expect: inline error bar appears with message and a Retry button.
   - Press Retry (after re-enabling network or allowing mock to succeed).
   - Expect: save retries, succeeds, and overlay closes; draft is preserved until success.

9. Draft preservation after error
   - Start drafting a long note, then force a save failure (offline/mock).
   - Confirm the draft text remains in the overlay after the error (do not lose text).
   - Retry and confirm draft clears on successful save.

10. Haptics & saved pulse (reduced motion)
    - On a physical device with haptics, save an item and confirm the success haptic (if device supports it).
    - Confirm the small "✓ Saved" pulse shows for a short time when not in reduced-motion mode.
    - In reduced-motion mode (or via OS accessibility setting), verify haptics/pulse are suppressed or minimal.

Notes & troubleshooting
- If the overlay does not render V2 behavior, confirm `EXPO_PUBLIC_FEATURE_OVERLAY_V2=on` (staging) and that the gateway is selecting `UnifiedOverlayV2`.
- For analytics verification, subscribe to `eventBus` in a dev console or add a temporary listener to confirm `OverlayTypeChanged`, `OverlayCommitmentToggled`, and `OverlaySaved` events fire.
- Use the Undo toast promptly — it auto-hides after ~3s.

Happy smoke testing — file bugs with clear repro steps, screenshot, and the timestamp of the run.