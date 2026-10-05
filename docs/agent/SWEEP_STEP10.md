# The wrap up in today's thread: what was built, and what step 10 picks up

For the session that does step 10 (Sweep on the core). The Sweep redesign is
built on `sweep-updates-10.04`. It did not touch Gremly's side: nothing in
`workers/cortex/agent/`, no prompt and no model was changed, apart from the
one dates fix James asked for on 4 Oct (commit `1048214b`, dates only). This
file is the list of what was left for you, so nothing has to be found again.

James's docs for this work (Claude Docs):

- Build plan and status, kept current through the build:
  https://claude.ai/code/artifact/57fedd81-a249-4ab0-9918-e06904ce0759
- Sweep handoff: https://claude.ai/code/artifact/43136371-876e-446a-9371-401bcdd3c036
- The spec is the prototype, Gremly Evening Thread version 2, with the switch
  on This build: https://claude.ai/artifact/NrTta8DPpAnNVVgKJm6Q12 (a copy is
  in `Claude outputs/evening-thread-in-chat-v2.html`). Switch it to With step
  10 to see each item below as James signed it off.

## Where each row stands (5 Oct, after step 10)

Built on `sweep-updates-10.04`. The step 10 doc has the replays and what
James does: https://claude.ai/code/artifact/7bf7e0ef-de86-4300-83e8-cf9dbcb57e4a

| #   | Where it stands                                                                                                                                                                                                         | Commit                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Done. Gremly writes the opener, the journal question, his reply and the close, with typing dots; the fixed sentence after 8s                                                                                            | `923e284f`             |
| 2   | Done. He picks up to two of the questions that may be asked and words them                                                                                                                                              | `923e284f`             |
| 3   | Done. He leaves out a question about anything sorted tonight; the rule's own filter stays                                                                                                                               | `923e284f`             |
| 4   | Done. The answer goes to him with the question; an item that is wrong comes back on a change card                                                                                                                       | `923e284f`, `f30c8092` |
| 5   | Done. He writes the choices for every question he asks                                                                                                                                                                  | `923e284f`             |
| 6   | Done. A message in today's thread carries the wrap up's state, and tonight's cards stay with it once it is finished                                                                                                     | `923e284f`, `f30c8092` |
| 7   | Done in today's thread: he sees tonight's cards by id with what they were before, and puts one back with an ordinary change. Keep and later stay off the card. Ask Gremly does not read tonight's cards yet             | `f30c8092`             |
| 8   | Done: the background reader, corrections, questions and anchors review, the daily context job, the day frame refresh, the plan picker, the greeting, the habit builder's day picture                                    | `5ccc1dc6`             |
| 9   | Done for nights with cards. Clear nights pass the replay through the writer (8 of 8), but `send.js` still sends the fixed line: one branch to delete once the other session's staged `send.js` is committed             | `fe91ad6a`, `08e6066e` |
| 10  | Done. His reply tells a journal entry from a message for him                                                                                                                                                            | `923e284f`             |
| 11  | Done. `scripts/wrap-replay`, `notif-replay`, `reader-replay`, `habit-builder-replay`, and new scenarios in `day-replay` and `chat-replay`                                                                               | each commit            |
| 12  | Done. In the small hours he is told the clock's date and their day apart                                                                                                                                                | `5ccc1dc6`             |
| 13  | Done. The brief is given last night's wrap up: finished or where it stopped, what moved to today by name, the journal                                                                                                   | `ff82a678`, `56c22ac9` |
| 14  | Done. The moods come from his reply to the entry, read with the day                                                                                                                                                     | `b0274df5`             |
| 15  | Done, apart from `brief/data.js` (staged by another session), the old daily picture fallback (`inngest-index.js` today facts) and the Worlds readers. They read flags the SQL clears; change them before the columns go | `9bd4c6db`             |
| 16  | Done                                                                                                                                                                                                                    | `923e284f`, `ff82a678` |

Also found and fixed: a time set on today's plan moved when the plan was
fitted again (`425903c3`), and the habit builder sent people to a Sweep banner
and an Organize button that are gone (`9bd4c6db`).

Still open after step 10:

- The daily context job lists journal entries and notes by the clock's time,
  so one written at 1am reads as the next day's. The reader now files their
  dates right; the daily context job needs its own replay before its lines
  change.
- Ask Gremly does not read tonight's cards (row 7 is today's thread only).

## What was built

The evening Sweep is a conversation with Gremly in today's thread, the same
thread the morning brief opened. In order: a recap of the day, the offer, the
swipe cards (the existing cards, opened over the thread, each decision saved
as it is made), a receipt with Undo, habits, the journal, up to two of
Gremly's open questions, and the close with Plan tomorrow. A skip night skips
only the cards. A clear night has no cards. After Not tonight the journal is
one tap away.

Every line Gremly says in it is a fixed sentence filled in from the day. No
model writes any of it.

Where the code is:

- `lib/wrapup/` the whole flow. `words.ts` holds every fixed line, in one
  file so step 10 can swap them. `flow.ts` builds the messages (pure).
  `useWrapUp.ts` does the work. `state.ts` and `session.ts` hold the state.
  `cards.ts`, `recap.ts`, `habits.ts`, `questions.ts`, `journal.ts` are the
  rules for each part. `day.ts` reads the person's day.
- `components/wrapup/` the cards drawn in the thread.
- `lib/changes/sweep.ts` Sweep's decisions as change records with Undo. Its
  two ops, keep and later, are Sweep's own and are not in `OPS`, so the agent
  can never put them on a card (`checkChange` rejects them as `unknown_op`).
- `app/screens/SweepFlowScreen.tsx` is now only the cards (route param
  `cards: 'wrap' | 'quick'`) and the week planner (`week: true`). The old
  evening steps are deleted. Opened with neither, it hands over to the thread.
- State is on the thread: `scope_chats.metadata_json.sweep` (`WrapUpState` in
  `lib/brief/types.ts`): the step, the path, every decision with what the item
  was before, the journal, the questions asked, when it finished. Wrap up
  messages carry `wrap: true` and a `sweep-*` type in their metadata.
- Workers: `workers/inngest-jobs/notifications/` (the evening count, the
  already wrapped up check, the clear night line), `workers/shared/day.js`
  (the 3 AM day end), `workers/inngest-jobs/brief/reaction.js` (leaves wrap
  up messages out of what it reads as yesterday's brief).

## James's decisions (keep to them)

- The prototype is the spec. Where code and prototype disagree, the prototype
  wins, and he is told first.
- One exception, from his review on 4 Oct: there is no Still open today card.
  The prototype shows one. A todo that was due today and did not happen is a
  swipe card like any other, with every choice a card has. Move it all to
  tomorrow is the quick way out on a busy night.
- The wrap up can be started at any hour, from his review on 4 Oct. A day can
  be over at 2pm. The first chip on Chat is the day's ritual: Plan my day
  until today has a plan or midday, then Wrap up today, then Tomorrow. The
  Today button and the pinned card offer it in the evening, once it is under
  way, or as soon as everything on Today is done. The nudges (the dot,
  Gremly's line, the notification) stay in the evening. A no or a part way
  stop before the evening does not quiet the evening: the state is stamped
  each time it is touched (`WrapUpState.touched_at`), and the app
  (`lib/wrapup/teaser.ts`) and the notification (`send.js`, `touchedTonight`)
  both read it. Before the evening the fixed lines use day words, nothing says
  tonight or night (`partWords` in `lib/wrapup/words.ts`). Step 10's wording
  has to cover both.
- The journal is protected: asked on every path, one tap away after Not
  tonight. A reply to the journal question saves straight to the journal, the
  box says so, an X sends the message to Gremly instead, and the entry has
  Undo.
- One day end for everyone, 3 AM, and every part of the app uses the same one.
- A skip night keeps habits and the journal and asks no questions.
- Lock In is removed across the app. Something is on Today or it is not. The
  columns stay in the database.
- Saying yes to a plan feeds what Lock it in did: 5% an item, three items a
  day.
- Gremly's questions in the wrap up: up to two open ones, picked by rule,
  until step 10.
- Keep and Bring back later are in the change model for Sweep only.
- The notification still goes out on a clear night, with one fixed line.
- Finishing the wrap up on a night with nothing to sort feeds 26%.
- Week mode stays as it is until phase 2.

## What step 10 picks up

Each row is something the mockup shows with Gremly's side in it. The build
does the plain version until then.

| #   | What step 10 adds                                                                                                                   | What the build does until then                                                                                                                         | Where                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gremly's own words for the opener, the journal question, his replies and the close                                                  | Fixed sentences filled in from the day                                                                                                                 | `lib/wrapup/words.ts`; a sweep surface on the agent                                                                         |
| 2   | Questions about tonight: Gremly decides what is worth asking, from what the Sweep left unclear                                      | Shows questions he already has open, oldest first, two at most                                                                                         | `lib/wrapup/questions.ts`; `gremly_questions`, written by the background reader                                             |
| 3   | Checking a question against everything the Sweep settled                                                                            | Drops a question only when it is tied to an item sorted tonight                                                                                        | Same                                                                                                                        |
| 4   | Fixing the item from the answer, on a change card with Undo                                                                         | Saves the answer to what Gremly knows. When the question is tied to an item, shows the item with Open it                                               | The answer goes through the corrections job, which never changes items                                                      |
| 5   | Buttons on every question                                                                                                           | Buttons only when the question came with choices                                                                                                       | `gremly_questions.choices`                                                                                                  |
| 6   | Knowing a wrap up is under way when the person types mid sweep                                                                      | The wrap up's state is saved on the thread, where his side can read it. It is not sent with the message. He answers as a normal turn in today's thread | `scope_chats.metadata_json.sweep`; `workers/cortex/agent/chat.js`, `workers/inngest-jobs/brief/dayTurn.js`                  |
| 7   | Reading and undoing Keep and Bring back later from chat                                                                             | The app writes them and undoes them itself                                                                                                             | `lib/changes/sweep.ts`; `workers/cortex/agent/tools/proposeChanges.js`                                                      |
| 8   | One day end in the rest of Gremly's side: the day turn, the background reader, anything else that reads the date                    | Done for Ask Gremly on 4 Oct (`1048214b`): chat, the greeting and the week he reads take the day from the day end                                      | `workers/shared/day.js`, `workers/cortex/agent/chat.js`                                                                     |
| 9   | Notification wording for the whole evening, including a clear night                                                                 | The writer's current rule on nights with cards (it still says Sweep). One fixed line on a clear night                                                  | `workers/inngest-jobs/notifications/copy.js` (`MOMENT_RULES.sweep`, `fallbackCopy('sweep')`, `clearNightCopy`)              |
| 10  | Telling a journal entry from a question when the person replies                                                                     | The box is set to save to the journal and says so. An X sends it to Gremly instead                                                                     | `lib/wrapup/useWrapUp.ts` (`takeTyped`)                                                                                     |
| 11  | Replays for the wrap up, before any wording or model change                                                                         | None needed: the build changes no wording Gremly is given                                                                                              | `docs/agent/HANDOFF.md`, How to work here                                                                                   |
| 12  | Clearer words for the clock after midnight. He is told the day and the time separately, so at 1:46 AM he reads Saturday and 1:46 AM | The date is right. The wording he is given is unchanged                                                                                                | The prompt that states the day and time, in cortex                                                                          |
| 13  | The morning brief knowing how the evening went: what was sorted, the journal, the plan made for the day                             | Wrap up messages are marked and left out of what the brief reads as yesterday's brief. The record stays on the thread                                  | `workers/inngest-jobs/brief/reaction.js` (`summariseThread`)                                                                |
| 14  | Moods on a journal entry chosen with the rest of what Gremly knows about the day                                                    | The same background read the journal uses today suggests the moods. The person can change them on the card                                             | `lib/wrapup/journal.ts`; cortex, the journal read                                                                           |
| 15  | Lock In taken out of what Gremly is told and reads                                                                                  | The app no longer sets, shows or reads Lock In, and the flags are cleared by SQL. His side still names it, see the list below                          | Below                                                                                                                       |
| 16  | The plan's words on his side. A plan that was said yes to is still called LOCKED IN in what he is given                             | The app says On Today, That's tomorrow, On Thursday. The stored status is still `locked`                                                               | `workers/cortex/agent/brief.js:93`, `workers/inngest-jobs/brief/dayTurn.js:186`, `writer.js:118, 263`, `reaction.js:52, 69` |

### Lock In on Gremly's side (row 15)

Lock In is gone from the app. These still read or name it. With the flags
cleared they read nothing, but the words are still in what he is given, so
they are yours to take out, with a replay first.

- `workers/cortex/agent/tools/items.js:14, 19` select `commitment` and
  `commitment_note`. The columns stay in the database so these selects keep
  working. Do not drop the columns before these are changed.
- `workers/cortex/itemDetail.js:32, 37, 117 to 129, 203` `committed`, the
  commitment note, and the line "they committed to it".
- `workers/cortex/cortex-index.js:4163` help text, "Lock In = top 3
  priorities". Also the entity chat context line "Commitment: User marked this
  as important", and organize day's `!t.isLockedIn`.
- `workers/inngest-jobs/inngest-index.js` `bucketTodayFacts` and
  `renderTodayFactsText`: "=== LOCKED IN (user's explicit priorities) ===",
  the ", LOCKED IN" suffix, and "=== ACTIVE COMMITMENTS ===".
- `workers/inngest-jobs/context/daily.js` reads `locked_in`.
- `workers/inngest-jobs/brief/data.js:123, 170, 175` selects `commitment`;
  unsorted todos leave out committed ones.
- `workers/inngest-jobs/signalCollector.ts` and `unifiedUserBundle.ts` select
  `commitment` on habits.
- App code that builds what he is sent, left as it was: `lib/brief/useDayTurn.ts`
  labels a committed todo `locked in` in the day turn request (`NOTE_ORDER`),
  `lib/api/organizeDay.ts` sends `isLockedIn`, and
  `lib/weeklySummary/buildWeeklySummaryPayload.ts` counts `locked_in_at` as
  `stats.lockIns`.

Plumbing left in the app, unused by any live screen: the store's
`addCommitment` and `removeCommitment`, `isHabitLockedIn`, the repo's
commitment methods, the overlay's commitment fields (hydrated and saved as
they are), `lib/commitments/`, the older Today screens behind their flags
(`app/tabs/TodayScreen.tsx`, `TodayV3View`, `TodayV4LanesView`,
`app/today/CommitmentsSection.tsx`) and the old item sheet
(`components/overlay/UnifiedCreateOverlay.tsx`, `components/CommitmentToggleRow.tsx`).
`EXPO_PUBLIC_FEATURE_COMMITMENTS` is off in `eas.json` and `.env.production`,
and off when unset.

## Known differences from the mockup

Kept current in the build plan doc, under Found while building (15 items when
the build was handed over). In short:

- Gremly sitting over the newest message is not fixed. No cause was found in
  the code.
- Undo lasts while the app is open.
- Undoing a journal entry does not take the feeding back (the gauge only goes
  up).
- A skip night does not feed for the cards.
- The cards open as a full screen, not a sheet.
- The yes button on today's plan reads Put it on Today. The mockup only shows
  tomorrow's plan, so that wording was chosen in the build.
- Plan feeding is 5% an item, up to three items a day in total.
- The week planner still marks the Sweep done and feeds the old way, so wrap
  up cards and the week planner in one evening can both feed. Phase 2.
- No typing dots between the wrap up's lines: they are fixed sentences.
- The first run Sweep demo still shows before the cards for someone who has
  never swept.
- Gremly's greeting on Chat is given the wrap up's cards left count, where it
  was given the old Sweep's count. The number changed, not his wording.
- A calendar event after midnight stays on its calendar date, and reminders
  stay on the clock.

The whole app counts today from the day end since `259bc1eb`:
`docs/2026-10-04-one-day-end.md` has the rules for new code, what changed and
what stays on the clock on purpose. Gremly's background jobs do not follow it
yet (row 8).

## Before you change anything on Gremly's side

Corpus and replay first, as for every step (`docs/agent/HANDOFF.md`, How to
work here). The wrap up has no replay suite yet (row 11): build one from real
evenings before any wording or model change. No examples and no word lists in
prompts, and never the person's own data in a prompt.
