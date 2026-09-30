# Mind Drop: drops about things you already have

After a drop is classified, one more call checks whether it is about one of the user's existing items: the same thing captured again, a change to one (its day, time, name or how often a habit repeats), a detail to add to a note or a todo, a todo now done, a habit they did, or an item that is no longer happening. If it is, the drop's card shows one quiet line and a tap opens the question popup with the item in it. Nothing changes until the user taps, and a yes has an Undo.

Design: the "drops about things you already have" canvas (September 2026), approved by James. Switched on for his hands-on test on 30 Sep 2026 (`MINDDROP_RELATE_ENABLED = "true"` in `workers/cortex/wrangler.toml`, live once the Worker is deployed). Setting it to `"false"` turns it off with no app build.

## How it works

1. **The call.** In `handleClassified` (`lib/minddrop/dropPhases.ts`), alongside the title call, the app posts the drop to the Worker route `minddrop-relate`. Only single drops from the one call classifier are checked, and not drops addressed to Gremly or asking a question (the conversation and open question types). It never delays or fails a drop: off, slow (7s), unsure or failed all mean the drop files exactly as before.
2. **The Worker** (`workers/cortex/minddropRelate.js`) reads the user's live items (open todos, habits with the days logged in the last 14 days, notes other than journal entries) and asks the chat matcher's model (`MODEL_ENTITY_MATCH`, Gemini 3.8 Flash) whether the drop relates to one of them. It returns a proposal, checked in code (below), or nothing.
3. **Held like a split.** A drop that relates syncs as a note carrying the proposal in `views.relation`, with how it was classified. A todo or a habit waits as a plain note, so no new todo or habit appears before the user decides; a note drop keeps its own kind.
4. **The card** (`app/screens/RecentDrops.tsx`) shows the chip of what the drop would have been and one line: "Looks like one you already have", "Mark ... done?", "Log it for ...?", "Add this to ...?", "Remove ...?", "Is this about ...?". A tap opens the popup.
5. **The popup** (`components/minddrop/RelationPopup.tsx`) shows the drop, the question and the item the way the chat's entity card does, with the change laid out as now and after:

   | Relation        | Question                                                  | Buttons                                         |
   | --------------- | --------------------------------------------------------- | ----------------------------------------------- |
   | Same thing      | Same as this one? (with how long ago the first was added) | Keep just one / Keep both                       |
   | Change          | Is this the one?                                          | Yes, move it (or change, rename) / Not that one |
   | Add to          | Add this to your note?                                    | Add to note / Keep separate                     |
   | Done            | Mark this one done?                                       | Yes, mark it done / Not that one                |
   | Did a habit     | Log this for your habit?                                  | Yes, log it / Not that one                      |
   | Cancelled       | Remove this from your list?                               | Yes, remove it / Keep it                        |
   | Two fit equally | Which one did you mean?                                   | the items / None of these, keep it as new       |

   Every view has "Skip for now". "Not that one" lists the other items the model looked at that could take the change, then "None of these".

6. **After a yes** (`lib/minddrop/relationActions.ts`), the change goes through the chat card's own `applyEntityChange` (`lib/chat/entityCards.ts`), so sync, rollback and Undo behave the same as in chat. "Keep just one" keeps the first and adds anything new from the drop to it. The drop itself was only the ask and is archived, except a journal entry, which stays as their entry. The popup shows a tick for under a second and closes. Then the cards that went (the drop, and the item when it was ticked off or removed) slide out of Recent Drops to the right, and a small toast at the top (`components/minddrop/RelationToast.tsx`) says what happened, with an icon for it, "Drop archived", Undo and a close button, for 5 seconds. Undo puts the item back, brings the drop's card back and puts the question back on it. An item whose day or time changed updates on its card straight away.
7. **Keep both, Keep separate, Keep it, None of these and Skip for now** all file the drop exactly as it was classified and leave the existing item alone. A todo or habit drop becomes that item through the same step a clarification answer uses. A drop that was unclear before it was held gets its question back.
8. **Sweep.** A held drop is always a Sweep candidate, whatever its kind or day, like a split (`selectSweepCandidatesUnified`). The same popup shows on its card. A yes moves to the next card; keeping it refreshes the card; skipping files it as classified. Closing the popup without a tap leaves the question on the card.

## The prompt

`MINDDROP_RELATE_PROMPT` follows the house rules and the chat matcher's principles: the model sees the whole list and decides by meaning, with no example drops, no lists of words and no dashes (`workers/cortex/__tests__/minddropRelate.test.js` fails otherwise). The classifier's prompt is untouched.

The principles that matter most:

- Most drops are new, even when they share a subject, a person or a word with an item. A wrong match is worse than none.
- Done and logged need the drop to say it has happened. Naming, planning or being reminded of the thing is not a report that it happened, so a drop that names a habit's activity never logs it on its own.
- An edit needs the drop to say the item itself has moved, been renamed or repeats differently. Doing or planning the thing on some day does not set that item's day.
- How something went, or how they felt about it, is their own entry, never a detail to add.

## Checks in code (never sent to the model)

- Confidence under 75, an id not in the list, or an answer that is not one of the relations: no question.
- A change must be valid for that kind of item (a day or time on todos and notes, a frequency on habits) and must actually change something.
- Done only for todos; logging only for habits to build, never for a slip on a habit to cut out; never a future day, a day already logged or one more than 14 days ago; nothing is added to a habit.
- In the app, the item is read again before anything changes: if it was ticked off, cleared or deleted since, the popup says so and offers to keep the drop as new.

## The replay

Every drop from the one active beta account (429, 22 May to 20 Sep 2026) was replayed against the items that account had at the moment of each drop. The review page with every question it would have asked is in `Claude outputs/mind-drop-relate-replay.html` (not in git: it holds real drops).

- It would have asked on 60 drops (14%): 1 done, 1 which one, and 58 "same as this one?". The other 369 filed as usual with nothing shown.
- The first run asked 56 times, including 10 changes; reading them found three kinds of wrong question (logging a habit from a plan, moving an item's day because the drop mentioned today, adding a feeling to a note). The principles above fixed all three without adding any examples or word lists.
- Speed: 0.9s typical, 1.5s at p90, 4.7s at the slowest, alongside the title call, so a drop does not take longer.
- Cost: about 2,600 input tokens a drop on this account's list; it grows with the list.

Two questions for James before switching it on:

1. **A plan for something a habit already covers** (16 of the 60). Someone who drops "Run" most weeks and also has a weekly run habit is asked "Same as this one?" each time. That matches the chat's rule (doing one makes the other redundant), but it is a tap each time.
2. **An older open item** (9 of the 60). A chore dropped again weeks after the first, which was never ticked off. The popup shows how long ago the first was added.

Caveats: items are rebuilt from what is in the database now, so deleted items are missing and due days are today's values; habit check-ins have a day but not a time, so a check-in made later the same day counts as already logged.

## Switching it on

```
# workers/cortex/wrangler.toml
MINDDROP_RELATE_ENABLED = "true"
```

then `cd workers/cortex && npx wrangler deploy`. The app side is in the build already and asks the Worker on every drop; while the switch is off the Worker answers straight away that it is off. Turning it off again needs no app build.

## Banked for this branch, after the hands-on test

**Undo puts reminders back.** Archiving or completing a todo, and archiving a habit, cancels its scheduled reminders (`archiveTodo`, `completeTodo`, `archiveHabit` in `lib/store/useGremlyStore.ts`). The matching `restoreTodo`, `uncompleteTodo` and `restoreHabit` do not schedule them again, so after an Undo the item is back but its reminders never fire. This affects the chat card's Undo ("Yes, mark it done", in `lib/chat/entityCards.ts`) and Mind Drop's Undo ("Yes, mark it done" and "Yes, remove it", in `lib/minddrop/relationActions.ts`). The fix belongs in the store's restore and uncomplete actions, so both surfaces get it: schedule each reminder again with `scheduleItemReminder` (`lib/notifications/itemReminderService.ts`) and save the new notification ids on the item. Check that a reminder whose time has passed is skipped, and that a restored item's reminders cancel correctly the next time it is completed or archived.
