# Gremly agent: handoff

For the session that carries the agent work on from step 6. Read this first,
then the docs below. James reads the docs; this file is for you.

## The project in one paragraph

Gremly's chat surfaces are moving onto one agent core: the daily brief
(today's thread), general chat and, once its redesign is built, Sweep. Each
surface keeps its own job; the core gives them one loop with tools, one way of
proposing changes (the change model), a task list that carries across the
conversation, and status lines while it works. It is not a rebuild: the
persona, the care rules, the context pipeline, the brief, the day record and
the item search all stay; the middle layer that handles a message changes.

## The plan and where it stands

| Step | What                              | Status                         |
| ---- | --------------------------------- | ------------------------------ |
| 1    | Map what exists (reuse map)       | Done                           |
| 2    | Measure today, budget per surface | Done                           |
| 3    | One change model                  | Done                           |
| 4    | The tools                         | Done                           |
| 5    | The core loop                     | Done                           |
| 6    | Triage update                     | Done                           |
| 7    | The brief on the core             | Done, merged to main           |
| 8    | Replay suites and model choice    | Folded into 7 and 9            |
| 9    | General chat on the core          | Done, merged to main (PR #145) |
| 10   | Sweep on the core                 | Built on `sweep-updates-10.04` |
| 11   | Focused model audit               | After chat and Sweep           |
| 12   | Rollout and watching              |                                |

Docs (Claude Docs; James comments and edits in them):

- Steps 1 and 2, what exists and what it costs, budgets, models:
  https://claude.ai/code/artifact/9c67de59-d7aa-4c13-a9d9-4f261082b413
- Step 3, the change model, with James's decisions:
  https://claude.ai/code/artifact/5a805271-bb94-4eb5-af4a-93b738f1cc5a
- Step 4, the tools: https://claude.ai/code/artifact/4e1d4c5d-72d0-47b7-a63d-79f3b906f228
- Step 5, the core, the first run with real models, what is still open:
  https://claude.ai/code/artifact/b3630ed3-f3f7-4d16-8f21-2134b31e864c
- Step 6, triage and the lane, the replay, decisions:
  https://claude.ai/code/artifact/167d9176-a2ff-4419-bbe7-34f71a7ffcbe
- Step 7, today's thread on the agent, the replay, decisions:
  https://claude.ai/code/artifact/0111f10c-cabe-4b88-86ed-8ee46a45a5c0
- Step 9, general chat on the agent, the plan and James's decisions:
  https://claude.ai/code/artifact/5987a64f-36a7-4307-980d-fecd250bf171
- Sweep handoff, what the Sweep redesign builds and what step 10 picks up:
  https://claude.ai/code/artifact/43136371-876e-446a-9371-401bcdd3c036
- The Sweep redesign's build plan and status (the wrap up in today's thread):
  https://claude.ai/code/artifact/57fedd81-a249-4ab0-9918-e06904ce0759
- In this repo, the list step 10 started from, with where each row stands:
  `docs/agent/SWEEP_STEP10.md`.
- Step 10, Sweep on the agent: what was built, the replays, what James does:
  https://claude.ai/code/artifact/7bf7e0ef-de86-4300-83e8-cf9dbcb57e4a

Each step so far has had its own doc. Keep that going: one doc per step, made
before the work, filled as it goes, ending with what is next.

## Where the code is

- `workers/shared/changes/` the change model's field list (`fields.js`) and
  checks (`check.js`), read by both workers and the app. `lib/changes/` applies
  and undoes in the app (store actions, history, habit schedule writer,
  conversion, links). `components/brief/ChangeCard.tsx` is the list card
  (Accept all, Undo). `lib/chat/entityCards.ts` `applyEntityChange` and
  `lib/brief/applyChanges.ts` `applyDayChanges` are thin wrappers over it.
- `workers/cortex/agent/tools/` the six tools (find_items, get_item, get_day,
  recall, web_search, propose_changes). `runTool` never throws.
- `workers/cortex/agent/run.js` the loop (`runAgent`). `providers.js` Gemini
  and OpenAI with tools (OpenAI reasoning models go through the Responses API:
  chat completions refuses tools with reasoning). `surfaces.js` the brief and
  chat jobs, tools, step caps and time budgets. `prompt.js` the core rules and
  the last step note. `tasks.js` the task list (`track_tasks`). `status.js`.
- `workers/shared/aiUsage.js` logs every model call from both workers to
  `public.ai_usage`; in cortex the job is route/step and every call of one
  request shares a run_id. `workers/shared/db.js`, `workers/shared/calendar.js`.
- `scripts/agent-smoke/` five turns with real models and a made-up person
  (10 of 10 pass). `scripts/day-replay/` the day turn's replay suite.

Today's thread calls `runAgent` (step 7); general chat does not yet.

## What the next steps need

**Step 6, triage (done).** `workers/cortex/triage.js`: with
`TRIAGE_ONE_CALL=on` one call (helper job `triage`, model `MODEL_TRIAGE`,
Luna with no thinking) returns mode, the three signals and, in Ask Gremly
only (`LANE_CHAT_TYPES`), the lane: quick, lookup or agent (`LANE_RULES`,
James's decisions written in). `readOneCall` reads the answer and names any
field that fell back. The lane is recorded, not acted on: it goes into the
triage call's ai_usage row as `meta.triage` (through `withAiNote` in
`workers/shared/aiUsage.js`) and into the `[GeneralChat:Triage]` log. The
replay is `scripts/chat-audit/run-lane.mjs` and `score-lane.mjs`; lane answers
are `data/lane_turns.json` with two blind labellers and an adjudicator
(`LABEL_GUIDE_LANE.md`, `labels_lane_A.json`, `labels_lane_B.json`,
`adjudicated_lane.json`). Results and James's choices are in the step 6 doc:
Luna one call 75% of turns with mode, length and search right against 68%
today, 95% of lanes right, 0.94s typical; Gemini 3.8 Flash was more accurate
(84%, catches more change requests) but slower and dearer, and James chose
Luna. Any triage change rewrites the reply's instructions on about half of
messages, so James judges the tone in the app; `TRIAGE_ONE_CALL=off` goes
back. Before step 9 routes on the lane, read the real mix from ai_usage
(`job like '%/triage'`, `meta->'triage'->>'lane'`) and rescore the lane if
the rules change (any rule change means relabelling with the new guide).

**Step 7, the brief on the core (done).** The app calls cortex `type:
'brief-turn'` (`lib/cortex/CortexClient.ts` `callBriefTurn`, server-sent
events) with the day turn's request plus `timezone` and the task list
(`buildBriefTurnRequest` in `lib/brief/useDayTurn.ts`). Cortex
(`workers/cortex/agent/brief.js`) reads it with the day turn's own
`readTurnRequest`, builds Gremly's persona from the care rules
(`inngest-jobs/careRules.js`) and the day with real ids (`renderDay`), and
runs `runAgent({ surface: 'brief' })` with a first status line at once. On
today's thread `propose_changes` is the brief's own version
(`proposeDayChanges`): op `plan` changes the plan on screen and today's set
times, checked against the day the app sent (`ctx.day`), and a plan row an
item row already covers is dropped (one row per item). The app draws the
agent's card from `Change[]` (`ChangeCard` `rowsOf`, `rowWords`) and applies it
with `applyCardChanges` (plan effects from the change model). The task list
lives on the thread (`agent_tasks`); the brief waits when a task needs an
answer. `AGENT_BRIEF` switches it; off, or when the agent cannot finish, the
day turn answers. Older app builds still call `day-turn`. Once the answer is
sent, the message gets chat's correction check (`learnFromTurn`,
`context/corrections.js`, which checks only the message just sent); the ledger
reader reads the rest within the hour. Replay:
`scripts/day-replay/run-agent.sh` (same scenarios and checks as the day turn,
plus cost per message). On Luna at low thinking, James's choice: 54 and 55 of
57 on 19 scenarios, about 3.8s typical, about 0.02 cents a message in the
replay. Live on 3 Oct (6 messages): 1.3s to 3.2s a model call, 2s to 5s a
message (the first, cold, 12s), about 0.09 cents a message with the
correction check. The day in each message (about 3,700 tokens) is never
cached; the rules (about 5,200) are cached after the first message. The
instructions stay the same from message to message and what changes rides in
the latest message, which is what lets the provider cache them. Gemini 3.8
Flash was faster but about 1.35 cents a message because none of its input
was cached.

**Step 8, folded into 7 and 9 (James, 3 Oct).** Step 7 made the model
choice for today's thread (Luna, low thinking, `AGENT_THINKING_BRIEF` unset),
so a four model comparison there would repeat it. What was left moves to
step 9: chat starts on Luna at low thinking with the same cached layout, gets
its own replay scenarios, and compares `find_items` with the whole list
matcher (`entityMatch.js`) before the quick lane moves to the search. A
second model is tried on a surface only when its replays or real use show a
gap. One writer per surface: the words the person reads come from one model
on that surface.

**Step 9, general chat.** Triage's agent lane goes to `runAgent({ surface:
'chat' })` with the persona from `gremlyPersona.js` and the preload from
`buildChatContext`; the quick lane stays as today. Chat's one change card
(`components/chat/EntityCardMessage.tsx`) and the list card become one
component here. Carried from step 8: Luna at low thinking, the cached layout,
chat's own replay scenarios (open conversation, remembering, habits, not only
plans), and the `find_items` against `entityMatch.js` comparison.

**Chat's writer (step 9, done 3 Oct on `chat-fixes-10.3`).** Ask Gremly's
quick lane writes on Luna with no thinking (`CHAT_MODEL_ASK`,
`CHAT_EFFORT_ASK` in models.js). `workers/cortex/openaiChat.js` sends an
OpenAI model's chat call to the Responses API and answers in Gemini's
shapes, so `geminiStream` and `geminiGenerate` hand it over and no surface's
reading code changed; a writer that fails to start is tried once on
`CHAT_MODEL`. The persona's general section gained "How the conversation
feels" (semantic, Ask Gremly only). The writer test is `scripts/writer-test`
(fixtures and outputs stay out of git): 40 of James's turns through the live
chat path, two blind judges, Luna with the new section 6.9 of 10, Luna
without it 6.7, the preview 5.2. The other chat surfaces stay on the preview
until each is checked. Ask Gremly's preload now carries the
week ahead (`workers/cortex/context/weekAhead.js`: the calendar and planned
todos for the next seven days, read live), so questions about the days ahead
are answered from them; before, chat had only the week so far.

**Chat home (step 9, 3 Oct).** From the mockup James approved
(https://claude.ai/artifact/RxvQRqbb722VymHacdNQB5): the three starter
buttons are gone; Gremly's greeting sits in a speech bubble and a row of
chips (`lib/chat/homeChips.ts`) below it, at the foot of the Chat page, left
of where Gremly perches. The shared box (`CatchAllNotepad`) is left exactly as
it is on Drop, so the box and Gremly stay still when the pages slide (James,
3 Oct: the mockup's one line box made them jump).
The Today card's mark and line follow the part of the day, and in the
evening, while things wait for a decision, it offers to wrap up (the quick
Sweep for now; the Sweep redesign repoints it). The greeting prompt
(`workers/cortex/greeting.js`) is semantic and knows the hour, what is still
on the calendar today, and what waits in the app.

**Chat's agent lane (step 9, 3 Oct).** Triage's lookup and agent lanes go
to `runChatTurn` (`workers/cortex/agent/chat.js`, the chat surface, Luna via
`AGENT_MODEL_CHAT`) when the account is in `AGENT_CHAT` (James's id for now;
`on` is everyone) and the app sent `agentCard`, which only new builds do.
The persona is `chatAgentPersona()`: the quick lane's, without its saving
rules or the date, so it caches. Status lines show while it works; the done
event carries the card and the task list; the app draws the card with
`lib/chat/useChatCard.ts` (Accept through `applyChanges`, Undo, Dismiss),
puts what was done with each card into the history, and keeps the task list
on the chat's `metadata_json.agent_tasks`. If the agent fails, the writer
answers. The pill split's companion call now writes only the title
(`buildTitlePrompt`, job `chat_title`), so the running summary is written
once. The replay is `scripts/chat-replay` (twelve kinds of message, every
name made up): 36 of 36 on Luna at about 4.7s and 0.03 cents a message.
One agent rule came from it (`agent-2026-10-03i`): a yes in words to an
offered change puts that change on the card as offered (accept and follow up
13 of 16 before, 16 of 16 after; the day replay unchanged). Still open: the
quick lane keeps its own card (`EntityCardMessage`) until the agent lane is
on for everyone, and `find_items` is compared with `entityMatch.js` before
the quick lane moves to the search.

**Chat's agent, faster (step 9, 4 Oct).** Each agent step is a model call of
1.5 to 2s, and a change took three (search, read, card). Now the agent starts
with what it needs, as today's thread does: the week ahead gives each todo
its id (`formatWeekAhead(week, { ids: true })`, the agent only; the week comes
back from `buildChatContext` through `opts.keep`), the items that share words
with the message are searched before the first step (`prefetchForChat`,
started alongside triage), and the chat job says to answer from those and ask
for other lookups together. `propose_changes` takes an id from what the agent
knows, not only from a tool. Triage starts once the profile and domain names
are read, with the rest of the context loading alongside it. Chat replay: 72
of 72, 3.1s typical against 5.4s, 1.8 steps against 2.4. Thinking `none` was
tried and was no faster (more steps). The loading line is on Luna
(`MODEL_LOADING_MESSAGE`, checked with `scripts/chat-replay/loading.sh`).
Space, World and Chapter chat stay on `CHAT_MODEL` (no messages in 90 days);
an item's chat is Ask Gremly's path. The old item matcher (`entityMatch.js`,
Gemini 3.8 Flash) costs about 0.5 cents a message, against 0.03 for the agent,
and the quick lane waits for it: compare it with `find_items` when the agent
lane goes to everyone.

**Step 10, Sweep on the core (4 and 5 Oct, `sweep-updates-10.04`).** The
evening wrap up in today's thread now has Gremly's side in it. Row by row it
is in `docs/agent/SWEEP_STEP10.md`; in short:

- Gremly writes the opener, the journal question, his reply to an entry, the
  questions and the close (`workers/cortex/wrap/words.js`, type `wrap-words`,
  helper job `wrap_words` on Luna), with typing dots; the fixed sentence is the
  fallback after 8s. Counts and buttons stay fixed. His reply also tells a
  journal entry from a message for him, and picks the entry's moods with the
  day. Replay: `scripts/wrap-replay`.
- Anything typed during the wrap up goes to the agent with the wrap up's state
  (`readWrap`, `wrapContext` in `agent/brief.js`): where it is, tonight's cards
  by id with what they were before (so one can be put back), and the question
  a message answers. An answer that shows an item is wrong comes back as a
  change card.
- Gremly's side counts today from the day end (`workers/shared/day.js`
  `personNow`): the background reader, corrections, questions and anchors
  review, the daily context job, the day frame refresh, the plan picker, the
  greeting. In the small hours he is told the clock's date and their day
  apart (`todayLine` in `agent/prompt.js`). Replay: `scripts/reader-replay`
  and the late scenarios in `scripts/day-replay` and `scripts/chat-replay`.
- The morning brief reads last night's wrap up (`readLastWrap`,
  `summariseWrap` in `brief/reaction.js`). Lock In is out of what Gremly reads
  and the habit builder's app knowledge (`habitBuilderPrompt.js`, replay
  `scripts/habit-builder-replay`). The evening notification says wrap up,
  never Sweep (`scripts/notif-replay`).

Left, each said in `SWEEP_STEP10.md`: the clear night line through the
writer (one line in `send.js`) and the brief's commitment selects
(`brief/data.js`), both in files another session has staged; the old daily
picture fallback and the Worlds readers still name Lock In; the daily context
job shows journal times by the clock; Ask Gremly does not read tonight's cards.

**The weekly review (batch 1 of 7 built, 5 Oct, `various-fixes-10.4`).** A
new conversation in today's thread that plans the week, run by the same brief
agent and written through the same change cards. The plan, with James's
decisions, the tested prompts and the rules for whoever builds it:
https://claude.ai/code/artifact/37dbe8b4-c594-4335-aec6-9c0eaf59997b. It is
built one batch at a time; each batch stops when it is green and is reviewed
before James deploys. Batch 1 is Gremly's side and the change model:

- The week's date rules are in `workers/shared/week.js`, for both Workers and
  the app (`lib/week/model.ts`): the weekly day (Sunday unless they choose
  another), the cycle a day is in, what a review started on a day plans
  (`reviewOn`), the kind of day a date is, and a day's room. Dates and numbers
  only.
- Six kinds of change for the week, `WEEK_OPS` in
  `workers/shared/changes/fields.js`, checked by `checkWeekChange` in
  `check.js`: later, habit_days, week_shape, intention, milestone, weekly_day.
  They are kept apart from `OPS`, because every surface's tools are built from
  `OPS`. The app applies them in `lib/changes/week.ts`, with Undo and words
  (`words.ts`). A Later is written by `lib/changes/later.ts`: back day in
  `resurface_at`, the day cleared, no reminder, `resurface_count` up by one.
- The app tells Gremly about the week by sending `week` with a message in
  today's thread (`WeekTurnContext` in `lib/cortex/CortexClient.ts`, read by
  `readWeek` in `agent/brief.js`). With it the brief runs its week variant
  (`surfaces.js`): one line about their week in the day (`weekLine`),
  `weekContext` beside `wrapContext` while a review is under way, the tools
  `get_week`, `hold` and `offer_week` (`agent/tools/getWeek.js`,
  `review.js`), and the week's changes on the card. Without `week` a request
  is sent exactly what it was sent before, instructions, tools and message,
  so an app build that cannot show the review is never offered it. Nothing in
  the app sends `week` yet.
- `hold` and `offer_week` only tell the app about the reply (`run.js` calls
  them signals): the answer carries `hold: { question }` when the review
  should wait for what Gremly asked, and `offer: { kind: 'week', done }` when
  the week's button goes under the reply. A reply written with either is the
  answer, with no step spent after it.
- The table is `weekly_reviews` (migration
  `20261005210000_weekly_reviews.sql`, with `days_off` on
  `notification_preferences`); the app reads and writes it through
  `lib/repo/weekReviewRepo.ts` and holds this week's row in
  `lib/week/thisWeek.ts`.
- Replay: thirteen week scenarios in `scripts/day-replay/week-scenarios.mjs`
  run with the day's (`run-agent.sh`; `--set week` or `--set day` for one set,
  `--with-week` to run the day's scenarios with the week's tools on). Their
  checks look at what was proposed, held and offered, never at the reply's
  words. On Luna at low thinking the week set passes 37 to 39 of 39, about
  2.6s typical. What slips is Gremly asking a question without `hold`, or
  holding to ask where it could have offered the change. The day set passes
  about 96 of 99 with or without the week: which scenario slips changes from
  run to run, and `wrap-answer-fixes-item` slips most (4 of 8 on the commit
  before this batch, so it is not from this work).

What the next batches need to know:

- James's decisions on top of the plan (5 Oct): a Later item showing on Today
  on its back day is batch 4; the wrap up cards' own Later
  (`lib/changes/sweep.ts`, which still writes the day and a reminder) moves to
  `lib/changes/later.ts` in batch 6; Ask Gremly gets `offer_week` and the week
  line in batch 3, with a chat replay before and after.
- Batch 3 wires the app: `useDayTurn`'s `wrapContext` hook becomes the hook
  for both rituals and sends `week`; the answer's `offer` draws the Week
  button.
- James, 6 Oct, for batch 3: after any typed message the review shows a
  Carry on button and never moves on by itself. A `hold` only hides that
  button until they have answered. His replay run had Gremly ask a question
  with no `hold` and no `needs_answer`, so the review must not lean on
  either to know it should wait: the button is what moves it on.
- James, 6 Oct, for batch 3: build the Done step's re-keying. When they move
  their weekly day at Done after an out of cycle review, that review counts
  as the new week's (see the note on moving the weekly day below).
- The settings screen (`hooks/useNotificationSettings.ts`) and
  `lib/week/thisWeek.ts` each hold the weekly day. When the setting moves to
  the Your week section, give it one home.
- A review of next week, brought forward, has a row for another week than the
  one today is in. The shape, the intention and a milestone carry
  `week_start`, and the app reads that week's row from the account when it is
  not the one it holds; `useThisWeek` itself only ever holds this week's.
- When the weekly day moves, the week they are in moves with it, so the review
  the app holds is let go and read again. The plan says a review just done
  out of cycle should count as the new week's when they choose to move the
  day at its Done step: batch 3 built that re-keying.
- Undo of a Later puts the todo's day back, and the database then stamps the
  day as set by the person, as it does for any day change. Undo of a habit
  day that had been kept or missed brings it back as planned.

Found on the way and left as they were, because none is from this work:

- `wrap-answer-fixes-item` in the day replay fails about half its runs, and
  the short reply check on `week-ahead` fails about one run in seven.
- The wrap replay's travel day slips now and then on its check that nothing
  is said about tonight (47 of 47, then 45 of 47, on the same code;
  `workers/cortex/wrap` is untouched here).

**The weekly review, batch 2 of 7 (6 Oct): the weekly pipe and the read.**
Everything weekly now runs on the person's own weekly day, and Gremly makes
its read for the review. Nothing in the app calls the read yet; batch 3 does.

- The pipe is in `workers/inngest-jobs/week/index.js`. `weekly-pipe-dispatch`
  runs on the hour and starts `weekly-pipe` for everyone active whose weekly
  slot (their weekly day at the hour of `weekly_time`, Sunday 6pm unless they
  chose) is within three hours, one event per person per weekly day. The pipe
  runs their weekly synthesis for the seven days ending on that day, waits up
  to two hours for it, then makes their read ahead. The synthesis no longer
  has a scheduler of its own (it left for everyone on Sunday at 11:00 UTC);
  a first look or a catch up takes the last whole week of theirs
  (`lastCompleteWeekEnd(tz, weeklyDay)`).
- The read is in `week/read.js`: `gatherRead` reads what Gremly knows,
  `renderRead` writes the input with a short id for every todo, habit and
  dated thing and with every count worked out in code, one model call
  (`weekRead`, Luna at medium effort, `weekReadFallback` Flash, in
  `context/llm.js`), then `checkRead` turns the short ids back into real ones
  and drops or puts right anything with an id it was not given, a date out of
  place or a count over its limit. Each time is counted (`dropped`) and
  logged with `[ALERT][WeekRead]`. A milestone names the dated thing it leads
  up to and takes its date from that thing, and goes through
  `checkWeekChange`, so a milestone on a card can always be set up. What is
  kept is `WeekRead` in `lib/repo/weekReviewRepo.ts`, on `weekly_reviews.read`.
- Which read serves a review is decided from dates and the week's row alone
  (`readServes` and `extraUsed` in `workers/shared/week.js`, with `reviewOn`).
  The weekly day and the two days after use the read the row holds; so does a
  week brought forward the day before. Any other day is the one extra of the
  week: a fresh read the first time (the row's kind becomes `extra`, which is
  what "the extra is used" means), and that same read after it. A fresh read
  sets `read`, `kind`, `span_start` and `prompt_versions.read`; it makes the
  row `ready` only when it is new, ready or skipped. A week that is started
  or done keeps its status: the review's progress is the app's to move.
- A read was made ahead only for someone with a review whose `completed_at`
  is in the last 28 days. Batch 3 switched that rule off at James's word (it
  is still in the code, behind `READ_AHEAD_NEEDS_REVIEW`), so the read ahead
  is for everyone the pipe runs for. `completed_at` is set when a review is
  done.
- Making and keeping are two halves (`prepareWeekRead`, `keepWeekRead`). The
  pipe runs them as two steps, so a save that fails is tried again without
  paying for the read twice. Before keeping, the row is looked at again: when
  another read that serves was kept while this one was being made, that one
  stands.
- The app's way in: `callWeekRead({ date })` in `lib/cortex/CortexClient.ts`,
  cortex `type: 'week-read'` (`workers/cortex/weekRead.js`), inngest-jobs
  `POST /api/week-read`. A read takes 30 to 75 seconds, so the answer comes
  as server-sent events with a ping every eight seconds. The call gives up
  after two minutes, or after thirty seconds of silence. When it fails, read
  the week's row again (`getWeekReview`) before asking a second time: a read
  that was nearly made may have been kept.
- The weekly summary covers the seven days ending on their weekly day
  (Monday to Sunday for a Sunday, as before). The dispatcher works the week
  out with `cycleOf`, and the summary worker takes any real day as
  `week_start`. In the app the summary for the week they are in is the one
  whose seven days include today (`lib/weeklySummary/currentSummary.ts`),
  used by the banner, the summary screens and the Worlds tab's card.
- The week replay is `scripts/week-replay/` (`run.sh`, with `--repeat`,
  `--only`, `--show`, `--effort`, `--model`, `--judge` and `--input`): seven
  made up people, checks on structure, ids, dates and numbers, and a judge
  model from another family for the health scenario. It exits with an error
  when a run fails. On prompt `week-read-2026-10-06l`: 22 of 22 (the seven
  people twice and the health scenario eight more times), about 48 seconds
  typical and 75 at most with four running at once. The two prompts before
  it slipped about once in eight on the health scenario, by using the word
  in their own habit's name, and once gave an intention of thirteen words.
  At low effort it passes too, in about 14 seconds, with a thinner read; the
  plan chose medium on real data and that stands.

What the next batches need to know:

- Batch 3 calls `callWeekRead` behind the loading screen. The answer's `on`
  is what a review started today is (`reviewOn`). When the weekly day's read
  is used a day or two later, its `busy_days` and each habit's `days` still
  hold the days gone: leave out those before `on.span_start`.
- Each `coming_up` has the item it is when it is one of theirs (`item`), each
  `needs_you` and priority has real todo ids, and each milestone is a
  `milestone` change as it stands (`goal`, `date`, `steps`), with `about`
  naming the dated thing. Their own titles are shown from the ids: Gremly's
  words never name anything medical, so a card that needs a title should use
  the item's own.
- A weekly review left started in its window and opened again later: James
  ruled on 6 Oct that it resumes where it was with the same read and does not
  use the extra. Batch 3 built it (`reviewWith`).
- Batch 4's spread is given the read's input plus their answers:
  `renderRead` is the one place that input is written.
- The push for the summary and the review together, and the review offers,
  are batch 5. The summary's push is unchanged here.
- Left on Monday to Sunday then, and moved to the person's week in batch 7:
  the summary's cadence detector (`summary_detect_cadence_calibration_mismatch` buckets
  habit weeks with `date_trunc('week')`), the Worlds tab's "this week" range
  (`components/worlds/WeeklySummaryCard.tsx`). The old Sweep's
  `resolveSweepBlock` went with it in batch 6.
- The Worlds structure run is still Sunday at 10:00 UTC
  (`worldsWeeklyScheduler.ts`). The synthesis used to follow it an hour
  later. It now runs three hours before each person's slot, so for anyone far
  enough east that this falls before 10:00 UTC on Sunday, or on another
  weekly day, it reads the structure from the Sunday before. Everyone active
  today is in London or Los Angeles on Sunday, where the order is as it was.

Found on the way:

- Fixed, because the code was being changed anyway: the Worlds tab's weekly
  summary card looked for the week by the UTC date of a local Monday, which
  is a Sunday anywhere east of UTC, so in British summer time the card for a
  new summary never showed. It now uses the person's own day.
- `callBriefTurn` opened its stream without `pollingInterval: 0`, so a stream
  that ended without its answer was posted again every five seconds until
  the call's own time ran out. Fixed in batch 3 (`askOnce`, with the worker's
  pings).
- The wrap replay still slips now and then (92 of 94 on this code, on the
  check that nothing is said about tonight and on a count it should say);
  `workers/cortex/wrap` is untouched here.

**The weekly review, batch 3 of 7 (6 Oct): the review in today's thread, the
Week button and Your week in Settings.** The review now runs from Gremly's
opening to Done in today's thread: the challenge, what matters most, the
shape, the intention, what is ahead and what needs them. The board comes in
batch 4; until then the review goes from what needs them straight to Done.

- Where it is. `lib/week/useWeekReview.ts` does each step's work.
  `lib/week/review/flow.ts` says what each step puts in the thread (no side
  effects, tested by itself), `state.ts` what each card starts from and what
  Gremly is told, `words.ts` every fixed word, and `session.ts` holds the copy
  being worked on while the app is open. The cards are in `components/week/`
  (`WeekCard` picks one by `meta.card`). `app/tabs/AskGremlyScreen.tsx` wires
  it in beside the wrap up.
- In the thread. Every message of the review carries `week: true`, so the
  brief's and the wrap up's readers leave it alone and yesterday's reaction
  leaves it out (`workers/inngest-jobs/brief/reaction.js`). A step's card is
  one `system` message, `{type: 'week-card', card, week_start}`, drawn live
  from the week's row. What was settled is patched onto the card (`settled`)
  and shows as their bubble under it. The newest card of a step for the
  review's week is the one that can be acted on (`isLive`); any other copy
  shows only what was settled. The opening and the Done card draw from what
  the card itself keeps (`at`, `summary`), so a thread read back on a later
  day still shows them.
- Progress is on the week's row, with no new columns: `answers.step` (where it
  has got to), `challenge`, `priorities`, `hours`, `busy_days`, `dates_out`,
  `intention`, `intention_id`, `milestones`, `needs_you`, `said` (what they
  typed along the way, the last twenty, for batch 4's spread), `guessed` and
  `day_asked`. `status` goes ready, started, then done with `completed_at`,
  or skipped. `changeWeekReview` writes `status` and `completed_at` too,
  `createWeekReview` makes a row when there is none, and `moveWeekReview`
  moves one to another week.
- Typed messages. While the review is under way, a typed message is put in
  the thread by the review (`brief-reply`, action `week_typed`) and goes to
  Gremly as a turn (`useDayTurn.ask`) with the review as it stands
  (`weekTurnContext`). After it the review never moves on by itself: a Carry
  on button shows under the thread (`WeekFooter`; it is not a stored
  message). At the challenge, Carry on moves to what matters most, since what
  they typed was their say on the read. At any other step it brings the
  step's card back at the foot of the thread with what was picked kept. When
  Gremly's reply came with `hold`, the button is hidden until their next
  message. When Gremly cannot be reached the review says so and stays put.
  A message sent while a step is being saved waits its turn.
- The review and the wrap up share today's thread, and whichever spoke last
  has it (`hasThread` in the hook). Once the wrap up speaks after the review,
  typed messages, the pill above the box and the turn's follow up are the
  wrap up's again, and the review is picked up from the Week button.
- Picking up. Opening the review always works from the date and the account
  (`locate`), never from what the thread last showed. Done shows the week (a
  recap card until batch 4's week view). Started carries on from
  `answers.step` with the same read, and in a new day's thread the cards so
  far are put back. Otherwise it is the opening. `reviewWith` in
  `workers/shared/week.js` is James's rule: a review
  started in its window and opened on a later day is still that review, with
  its read, and it does not use the extra.
- Out of their weekly window, with the week done and the extra still free,
  the week is shown with an offer to plan the rest of it again. Yes starts
  the extra on the same row: a fresh read, with their answers kept as where
  the cards start. Once the extra is done the button only shows the week, and
  Gremly is told no other review can be started today (`reviewBlocked`). An
  extra left part way does not block: opening it picks it up.
- Not this week sets the weekly review's row to `skipped` (the row is made
  when there is none) and the Week button stops being highlighted. It writes
  nothing for an extra or a week brought forward.
- Done asks once (`answers.day_asked`), after an extra or a week brought
  forward, whether that day should be their weekly day. Yes saves the weekly
  day first, then moves the row to the week that starts tomorrow (`rekeyed`,
  kind `weekly`), and the thread's cards and the intention note go with it.
  Each part can fail without the others, and Gremly's line says which of
  them happened (`dayAnswerMsgs`).
- Just plan it takes Gremly's picks and guesses for every step not yet
  settled and ends the review (`answers.guessed`).
- When a step fails the thread says so (`WEEK_COPY.stepFailed`,
  `openFailed`), and what was half done is taken back where it would
  otherwise be made twice (a milestone's steps). When the thread goes off
  screen while the review is adding to it, nothing is added to the chat on
  screen (`LeftThread`), and `session.left` picks the review up when the
  thread is back.
- The Week button is a pill in the Today header
  (`components/now/NowHeader.tsx`, read from `weekButton` in `state.ts`). It
  opens today's thread with `todayThreadParams('week')`.
- Settings has Your week (`app/screens/YourWeekSettingsScreen.tsx`): the
  weekly day and the days off. The weekly day has one home, `useThisWeek`
  (`chooseWeeklyDay`, `chooseDaysOff`); the notification screen links to it
  and keeps none of its own.
- Ask Gremly has `offer_week` and the week line (the `chat` surface's `week`
  variant) when the app sends `week` (`chatWeekContext`). Without it the chat
  prompt is exactly what it was. The weekly day is not moved from Ask Gremly.
- The read ahead is for everyone the pipe runs for
  (`READ_AHEAD_NEEDS_REVIEW = false` in `workers/shared/week.js`; the four
  week rule is still in `prepareWeekRead` behind it). None is made when the
  day is out of their weekly window or they have said not this week.
  `readEffort` is medium for every review, the midweek extra too.
- The stream. `askOnce` in `lib/cortex/CortexClient.ts` posts once
  (`pollingInterval: 0`) for the read and for the brief turn, and gives up
  after a stretch of silence (the brief turn after 15 seconds, or 30 in all).
  `briefTurnResponse` pings every five seconds, so a turn that is still being
  worked on is never silent. Cortex has to be deployed before the app update:
  the new app against the old worker would give up on any turn that says
  nothing for 15 seconds.

Replays on this batch (Luna, low thinking unless said):

- Week set 38 of 39. The sentence that tells Gremly how the review carries on
  was measured against the last commit. Batch 2's "carries on by itself" is
  no longer true. Saying it carries on "once they tap the button" made Gremly
  ask without `hold` 3 times in 10 on `week-worn-out` (batch 2: never in 10).
  Saying the button "is kept back" until they answer made it hold plain
  answers (13 of 18 on the three plain scenarios). What is there now keeps
  batch 2's two sentences without "by itself" and says after them that a
  button carries the review on: `week-worn-out` holds 19 times in 21, and the
  plain scenarios never hold.
- Day set 33 of 33, agent smoke 10 of 10, the weekly read at medium 7 of 7.
- Chat 37 and 38 of 38, and 37 of 38 with the week. The miss is
  `hulu-and-sister` asking when the sister visits where it should offer the
  todo. With no week sent that prompt is the same as batch 2's.
- Wrap 91 and 93 of 94 (`workers/cortex/wrap` is untouched). The miss that
  repeats is the check for words about tonight reading "bed" in the made up
  habit's own name.
- The weekly read at low effort, tried for the midweek extra: 6 of 7 on the
  whole set and 5 of 8 on the health scenario, against 22 of 22 at medium.
  It used a word from their own habit's name, and once gave a todo again as a
  milestone step. James ruled medium for the extra too (6 Oct), and
  `readEffort` is the one place the effort is decided.

What the next batches need to know:

- Batch 4 puts the board between what needs them and Done. The steps are
  `CHAT_STEPS` and `stepsFor` in `state.ts`. `weekTurnContext` already sends
  empty `habit_days`, `placed` and `later` for it, and `answers.said` is
  there for the spread.
- Your week shows a recap card in the thread until the week view exists (the
  done branch of `route` in the hook).
- The review offers of batches 5 and 6 can start it by opening today's thread
  with `todayThreadParams('week')`, which calls `weekReview.open()` once the
  thread's messages are in.
- A weekly day moved on Gremly's card outside the review moves no row. Only
  the Done step's answer does.
- The intention card follows the mockup: a draft once picked can be swapped
  for another or for their own words, and not unpicked. Their own words can
  be cleared with Change, and the intention's note is then archived.
- If the app is closed between the Done card and the question about their
  weekly day, the question is not asked later.
- An independent read of this batch's diff found thirteen things, one of them
  serious (a second chat screen emptied the review in hand). All are fixed
  here with tests. The same read is worth doing on batch 4.

**The weekly review, batch 4 of 7 (6 and 7 Oct): the board, the spread, their
own days, Your week, and Later on Today.** The review now ends on the week's
board. Gremly spreads their open todos across the days, they move what they
like, and Done saves the week as one change with one Undo. Nothing new in the
database: `weekly_reviews.spread` was there already.

- **The spread** is `workers/inngest-jobs/week/spread.js`, beside the read
  and given the read's own input plus their answers: `spreadFrame` and
  `renderSpread` (pure), one model call (`weekSpread`, Luna at low effort),
  then `checkSpread` (pure). The app asks with `callWeekSpread`, cortex
  passes it on (`type: 'week-spread'`, with pings), and `ensureWeekSpread`
  writes only `spread` and `prompt_versions` on the review's row. The model
  places todos; habits are put on their days by code. It names a day for a
  Later only when the day matters, and code spreads the rest through the next
  four weeks (`spreadReturns`), so a Later never goes without a day.
- **The rules both sides share** are `workers/shared/weekBoard.js`: where a
  todo is against the days being planned (`todoSpot`), whose a day is
  (`gremlyPut`, `released`), the days a Later can come back on, the hours and
  busy days, and what a spread was made from (`spreadBasis`). A spread whose
  basis is no longer the review's is asked for again, a moment after the
  answers change. The basis is everything settled on a card that the spread
  is given: the day, the days planned, hours, busy days, priorities, what
  they said of their own days, their intention, what they told Gremly about
  his read, what they decided about each stuck thing, and a count the app
  raises whenever a change to their items is saved during the review
  (`answers.touched`: a card applied or undone, milestone steps set up or
  taken back). What they type along the way reaches the next spread that is
  made and does not ask for one. Ahead of the board the ask waits six
  seconds, so a run of changes is one call; on the board it waits a second
  and a half.
- **What the spread in hand was made for** is what this app asked for when it
  asked in this sitting (`session.spreadFor`, `reliefFor`), and what the
  spread says of itself only when it was read with its row
  (`lib/week/board/now.ts spreadState`). So an app and a worker that word the
  basis differently can never leave a spread looking out of date for good.
  While a spread for these answers is on its way the board's card says
  Gremly is fitting the week, and the sheet's Done is off (`boardReady`); a
  spread that failed leaves the board theirs to finish by hand.
- **Their own days (James, 6 Oct).** A day they gave a todo themselves is
  theirs: the spread plans around it and Gremly never moves it. A todo on a
  day is theirs unless it is exactly where Gremly's last spread of this same
  week put it, which is kept at Done as `answers.planned.gremly`. James
  wrote "since their last review (decided_at)"; no clock is compared, because
  `decided_at` is the database's time and a review's finish is the phone's,
  and because it would hand over a day they set before their last review. He
  agreed to this reading.
- **The question about them.** With six or more (`KEEP_ASK_FROM`) the board
  step asks once: Keep my days, Keep some, Rearrange it all, with each day's
  load against its hours shown first and over-full days in red. Fewer than
  six, Just plan it, or no answer keeps them (Just plan it writes no answer,
  so nothing in the thread says they chose). Keep some lists them by day
  with a pin each (`answers.keep`, `answers.freed`). Rearrange hands them to
  the spread, except a todo with a time of day (`due_time`), which nothing
  frees. A freed todo is then one of the todos to spread like any other: on a
  day when the model places it, and waiting in Later with a day to come back
  when the model leaves it out. The first build put a left out one back on
  its day, ahead of what the model had placed there, which pushed the model's
  own picks off the day; the prompt has always said that what is left out
  waits in Later, so the check now does what the prompt says. On the board
  it stays on its saved day until a spread names it, and nothing is saved
  until Done. A freed todo the read's list does not reach (more than 120 open
  todos) is not released, since the model could not place it. Answering the
  question again starts their own days afresh: what was moved off them since
  goes back to where it is saved.
- **Over-full days.** Each day their kept todos overfill gets a card, one at
  a time, after the question: take Gremly's moves, change the day by hand on
  the board, or leave it (`answers.relieved`). James ruled that the model
  picks the moves, not code: one call for all the over-full days,
  `workers/inngest-jobs/week/relief.js` (`weekRelief`, Luna at low effort),
  made in the same request as the spread from the same frame and kept inside
  it as `spread.relief`. `checkRelief` holds every move to their own untimed
  todos on an over-full day, a day with room, and any hard date. When the
  call fails the spread still stands, the day stays red and its card says no
  moves could be worked out. Taken moves become their own moves on the board,
  unsaved until Done. The suggestions in hand stay on the cards until the
  last over-full day is answered (`reliefBasis` leaves those answers out);
  then the week is spread again around what they moved. Each day keeps how
  many moves the model offered (`asked`), so the card tells a day Gremly
  would leave as it is from one whose moves did not hold up. A day is over
  only when it holds kept todos of theirs: habits alone leave nothing to
  move, and a habit day Gremly only suggested is put on a day only where
  there is room beside what is theirs. Opened to change one day by hand, the
  sheet is titled for that day and its Done only closes it; the day counts
  as dealt with only when something was moved.
- **Hard dates in the spread's check.** A todo with a hard date on the days
  being planned is always on a day up to that date: the latest one with room
  when the model missed it, the date itself when none has. It is the last
  thing a full day gives up, and then goes to a day up to its date, after or
  before, or stays where it was over the room. A hard date already gone by
  holds a todo to nothing. A back day never passes a hard date still ahead
  while an earlier day is open (`spreadReturns` takes `by`).
- **The read** marks each todo on a day they chose ("which they chose") and
  is told those days are theirs to decide (`theirDays`, read version
  `2026-10-07a`).
- **The board in the app** is `lib/week/board`: `model.ts` works out the
  board from what is saved, the spread over it and their own moves over both
  (`boardOf`), what Done has to write (`boardDiff`), where the step stands
  (`boardStage`) and the suggestions as the board stands (`reliefFor`).
  `now.ts` feeds it from the store and the review in hand, `save.ts` writes
  it. Their moves live in the session and are kept on the row a moment later
  (`answers.board`), so a board left part way comes back. The cards are
  `components/week`: `BoardStep` (the step's one card in the thread, which
  stands for the question, then each over-full day, then the board),
  `KeepCards`, `BoardCard` and the sheet `WeekBoard`.
- **Saving** is whole or nothing (`saveBoard`): when any write fails,
  everything written is put back and the thread says so. One Undo sits under
  the Done card for as long as the app stays open. Undo writes the row
  first, then puts the items back, and marks the week planned again if not
  all of it could be put back. The Undo is let go when the week is planned
  again, finished again, or changed from Your week, since it would put back
  an older week over the newer one. Done also keeps the plan on the week,
  `answers.planned`: the counts for the week in short, `days` (each day's
  todo and habit ids) and `gremly`, which a change from Your week keeps.
- **Your week** (`app/screens/YourWeekScreen.tsx`, route `YourWeek`) is where
  the Week button and Gremly's button go once the week is done. It reads the
  plan back against how it went (`lib/week/yourWeek.ts`): each planned todo
  is done, open, moved, in Later or let go, and each day says how much of its
  plan is done. A Later that comes back on a day from today on shows on that
  day, as back from Later. A week planned once and being planned again says
  so, with a way back to the thread. Change your week opens the same board with no spread and only
  writes their own moves (`lib/week/board/change.ts`), with Undo. Open the
  conversation goes to the thread of the day the review was finished
  (`dayThreadParams`, and a `thread: 'day'` param on the chat screen). Plan
  the rest of it again, and Plan next week the day before their weekly day,
  go to today's thread, which makes the offer as in batch 3. There was no
  mockup for this screen, the question or the over-full cards, so they are
  built from the review's own cards.
- **Later on Today.** A todo with no day whose back day is today is on Today
  (`selectTodosDueToday`) and in tomorrow's plan when its back day is
  tomorrow (`todosDueOn`). After its back day it waits in the wrap up's
  cards, like any todo left from an earlier day.
- **A day given through the change model clears a back day**
  (`lib/changes/patch.ts`): a todo given a day is no longer put off.
- **Two things differ from the prototype, both on purpose.** The board's
  sheet has a back arrow, because Done alone left no way to the thread on a
  phone without a back button. The habits and Later intros leave out the
  morning check in and the nudge, which are batch 5.
- **Replays (Luna).** Weekly read at medium: 7 of 7 before the change to
  its input and 7 of 7 after. Spread at low: 7 of 7, about 17 seconds
  typical and 22 slowest; 7 of 7 again with every scenario told to rearrange
  (`spread.sh --keep none`), where 11 of the 13 todos handed over went on a
  day, 10 of them the day they were on, and 2 to Later. Relief at low, a new
  replay with four made up people (`scripts/week-replay/relief.sh`): 6 of 8
  on the first prompt, where a todo that gets ready for a trip was moved to
  the day the trip starts; 12 of 12 once the prompt said never to move such
  a todo to that day or past it. More runs of its health scenario then
  showed Gremly's line naming a treatment in 2 of 14. One sentence was added
  to the health rule and to the line's field (prompt `2026-10-07b`): 20 of 20
  on the health scenario and 12 of 12 on the set, about 12 seconds typical.
  The spread's health scenario, run eight more times, was 8 of 8.
- **The agent's replays are not all green, on the committed code too.** No
  agent, wrap up or chat code changed in this batch (the trees are the same
  file for file). On 7 Oct the day set gave 29 and 31 of 33 here and 32 of
  33 on the batch 3 commit in the same hour. Repeated on that commit:
  flying-at-three failed 2 of 6, fill-the-day 2 of 6, left-out-stays-out,
  wrap-answer-fixes-item and week-ahead 1 of 6 each. The wrap replay gave
  92 of 94, and the one moment that failed (travel-day:habits) fails on the
  batch 3 commit as well. Chat: 56 of 57 (hulu-and-sister, which was already
  unsteady) and, with the week sent, 54 of 57 then 57 of 57. The week set
  was 13 of 13 and the smoke 10 of 10. Batch 3's runs were 33 of 33 and 47
  of 47, so something has moved on the model's side since. One for the
  focused model audit.
- **An independent read of the batch** (three reviewers: workers, app logic,
  screens) found the following, all fixed with tests: a todo with a time
  could be freed when Gremly had placed it; hard dates could be put off or
  placed past their date by the room check; the left out rule above; a
  spread made before the intention, a decision or a card never saw them; the
  kept plan lost `gremly` on a change from Your week; the board could be
  finished on a spread made for other answers; Undo could leave a week
  marked planned with nothing on it; and a number of lines that said more
  than was true (Gremly counting their own placements as his, a busy day
  "kept light" on a board he had not spread, "a week" under a part week's
  habit count).
- **Known and left as they are.** A Later whose back day falls inside the
  days being planned is not counted as that day's load: a back day is a day
  to decide, not a day to do. Today's room is the whole day whatever the
  hour the review happens. Open the conversation does nothing visible when
  that day has no thread. The model calls have no time limit on the worker;
  the app gives up at ninety seconds and then reads the row, where a spread
  that finished late is still found.
- **Found and left for later.** A Later given a day from a todo's own editor,
  outside the change model, kept its back day (fixed in batch 6: the store
  clears it when a day is given). The wrap up's card selector leaves a todo
  out while its back day is ahead (the old Remind me later rule, which a
  test pins).
  The three one line navigations (the Week button, Gremly's button, the
  `thread: 'day'` param) have no screen level test, like batch 3's wiring.

What the next batches need to know:

- Batch 5 (done, below) put the morning check in and the nudge back into
  `WEEK_COPY.habitsIntro` and `laterIntro`, and the milestone check in line
  into the Done line.
- Batch 6 (James, 6 Oct): when the card deck moves into its own screen, its
  day picker shows how full each day already is. `boardOf` has each day's
  room, and `keepLoad` their own load on it.
- Deploy order is unchanged: inngest-jobs, then cortex, then the app. An app
  with this batch against workers without it gets no spread at all, so the
  workers go first.

**The weekly review, batch 5 of 7 (6 Oct): the brief and wrap up hooks.**
The week they planned now shows up through the days: the brief carries their
intention, checks in on a habit they planned for today, and offers the review
on the mornings after their weekly day; the wrap up asks their milestone
check ins, lets a planned habit move to another day, and offers the review at
its close; a note says what came back from Later while they were away; the
weekly summary ends on Plan next week; and the archive shows each past week's
review beside its summary. No migration.

- **The brief's week facts ride on its last offer row.** The worker that
  writes the brief (`workers/inngest-jobs/brief/data.js`, `index.js`) reads
  today's `habit_plans`, their week settings and the recent `weekly_reviews`
  rows, and puts two facts on the last offer's metadata: `checkin:
{ habit_id, title }` and `review_offer: true`. No new rows and no new
  buttons, so an app bundle that does not know them shows the brief exactly
  as before. Each of the three reads warns and is left out when it fails;
  the brief is still written. A brief that had no offer row of its own gets
  a row with no words and no buttons for the facts to ride on (batch 6;
  batch 5 used the fixed sign off line, which the old app showed).
- **The rules for a habit on a day of their week** are
  `workers/shared/habitWeek.js` (app door `lib/week/habitWeek.ts`): which
  habit a morning checks in on (`habitToCheckIn`: a weekly or monthly habit
  they are building, planned for today, not done, not quieted; one a morning,
  the longest first), the days left in their week, the room left on each
  (`roomLeft`, the board's rule), and the day one can move to (`moveDayFor`:
  the most room, it must fit, never a day already planned; `moveDaysFor`
  gives several habits their days in turn so no day is filled twice). Skip
  this week is kept on the habit as `views.checkins_quiet_until`, the last
  day of their week.
- **The app shows that row as the check in first** (`lib/brief/checkIn.ts`).
  `shownOffer` is a display rule worked out fresh from the store: while the
  habit is still on for today the row reads as the check in with Still on,
  Move it to a day, Skip this week; once it is not, the row is the offer
  again. A tap (`useBriefOffers`) marks the row, writes their reply, does the
  change (`applyCheckIn`, which reads back what was saved), says Gremly's
  fixed line with the habit's week under it (`HabitWeekDots`), then adds the
  offer itself as a new row (`afterCheckInStep`, `revealed_from`). A typed
  message under the check in is its answer in their own words: the row is
  marked and the offer follows once that turn is done. Nothing is said of a
  habit's week until their weekly day has been read (`loaded`), because the
  day the store starts with is only a stand in.
- **An offer that never arrived is still owed.** `checkInOfferOwed` finds a
  check in that was answered with no copy of the offer after it (the app
  closed, a save failed, or the typed message went to ordinary chat). It
  follows after the next turn in today's thread, or once when today's thread
  is next loaded and idle, and never once the wrap up has begun or a plan
  has been made.
- **Plan my week in the brief.** `briefOffersReview` (shared `week.js`) is
  true on the one or two days after their weekly day until the review is
  done or skipped. The app adds the button when it draws the offer, and only
  in today's thread. Tapping it opens the review.
- **Their intention** is on the brief's day card (`ThisWeekCard`, from
  `lib/week/intention.ts intentionOn`) and is sent with every typed turn.
- **What a typed turn is told** (`lib/brief/useDayTurn.ts`, kept by
  `brief/dayTurn.js readTurnRequest`, said by `cortex/agent/brief.js`): the
  intention; that a todo is a step towards a goal; that a habit is planned
  for today in their week, until it is logged; and how a Later stands (back
  today, came back on a day, put off until a day). Version
  `brief-2026-10-08a`, a label that sorts after the last one, not a date.
- **get_day knows their week.** A Later is one of the todos of the day it
  comes back on. A habit says whether the day is one it is planned on and
  which other days of their week are; their week is the one the thread sent
  (`ctx.week`), and with none sent the planned days nearby are given without
  being called a week. A habit planned on a day is on that day whatever days
  its routine names. The tool's description was left as it was: with planned
  days named there, the model called every habit planned (18 of 20 replies
  against 1 of 20). `propose_changes` now says that moving a habit to another
  day of this week is `habit_days`, and `shared/changes/check.js` lets a
  `habit_days` or `busy_days` change name a day already gone when that day
  was already planned or busy.
- **The plan pool** (`lib/plan`): a Later back today can be planned; a habit
  planned for today is in the pool as Planned for today; a milestone step
  shows its goal.
- **The wrap up's close offers their week** (`closeOffersWeek`, days 0 to 2):
  Plan my week while the review is to do, their week once it is done. Plan my
  week finishes the wrap up and starts the review straight in (`startNow`,
  thread step `week_now`); there is no goodnight, the review ends the night.
  The opening offer no longer has the button. A Plan my week on an offer from
  before the close opens the review and leaves the wrap up where it is.
- **Milestone check ins** (`lib/wrapup/checkIns.ts`). Open check ins dated
  today or up to three days back are tonight's first questions, two at most.
  The question's message carries the check in itself (`milestone_checkin`)
  and no `question_id`, since it is not a `gremly_questions` row. The answer
  is a journal entry with no Space (`goal_id: 'milestone:<id>'`) and the
  check in is settled on its review (`settleCheckIn`, one read, merge, write
  in the row's turn); skipped, it is marked so.
- **The wrap up picks its questions up after a restart** (`questionsBack`).
  Tonight's questions are held in memory. Reopened with one still waiting,
  typing is its answer again and its buttons come back from its own message;
  with none waiting the evening goes on to its close. Before this the wrap
  up could sit at its questions with no buttons.
- **The habits card can move a habit** planned for today to another day of
  their week (`move_to`, saved as `moved`).
- **The come back note** (`workers/inngest-jobs/notifications`). Away two days
  or more with a Later come back since: the planner adds the reason
  `came_back` to the nudge, ahead of the brief, so on a day with room for one
  note it is the one sent. It counts only what came back after the last day
  they opened the app and after the last such note (`readCameBackSaid`,
  `cameBackSince`), so one time away gets one note unless more comes back.
  The sender reads it again (`stillTrue`) and gives the writer the weekday
  and what came back, nothing else of the day. It goes to anyone with
  Reminders on (`reminders_enabled`, `policy.js prefFor`), whatever Notes
  from Gremly is set to, because it is about their own items (James, 6 Oct).
  The tap opens today's thread.
  `chooseAngle` no longer falls back to an angle the facts cannot be said
  with. Copy version `notif-copy-2026-10-08a`.
- **The summary's push** says the review is ready too while it is still to do
  (`week/summaryPush.js`); when the review cannot be read it is about the
  summary alone. The summary's last card has Plan next week on their weekly
  day, Plan your week after, Your week once done (`summaryWeekButton`), and
  nothing for an older week.
- **The archive** shows a past week's intention, what mattered most, and
  Planned N, done M (`lib/week/pastWeeks.ts`, from `yourWeekOf`), read with
  `getDoneWeekReviews` and kept per person. A todo on two days of a plan
  counts once. A failed read is said on the screen.
- **Words.** The habits and Later intros on the board are the prototype's
  again, and the review's last line says what the mornings and wrap ups will
  bring (`doneLine`): the habit check ins when habit days were planned, and
  up to two check ins still to come, from tomorrow on.
- **Replays (Luna unless said).** Day set 32 of 33 before and 32 of 33 after.
  Week set, now 18 scenarios with five new ones for today's thread
  (`week-day-*`): 13 of 13 before, 35 of 36 after over two runs. The new
  `week-day-move-planned-habit` was 2 of 5 before `get_day`, the `habit_days`
  rule and the check fix, and 8 of 8 after. Chat 56 of 57, and 57 of 57 with
  the week sent. Wrap 92 of 94, both misses in the wrap up's writer, which
  this batch did not change. Smoke 10 of 10, weekly read 7 of 7. Notes
  (Gemini Flash): the come back note 18 of 18 (`notif-replay --nudge`), the
  summary push 16 of 16 (`--summary`), the evening note 19 of 20, where the
  miss was both models timing out.
- **Unsteady scenarios, measured.** `week-ahead` passed 15 of 20, its reply
  one sentence over; it was already unsteady in batch 4.
  `week-worn-out`, `week-new-deadline` and the new `week-day-whats-on` each
  pass about eight in ten whichever description `get_day` has; the misses on
  the last are the day agent adding a Plan my day card nobody asked for.
- **Two independent reads of the batch** (workers, the brief side, the wrap
  up and week side, then the fixes) found the following, all fixed with
  tests: the come back note said things were on Today when they sat in the
  wrap up's cards, repeated daily, and could lose its one angle; `get_day`
  called days outside their week their week and missed a habit planned off
  its routine days; a failed read made the summary's push invite planning; a
  typed or half finished check in could leave the brief without its offer;
  the check in used the stand in weekly day before theirs was read; a done
  habit was told to the agent as planned; a check in was only recognised
  from memory, so after a restart it went to the wrong pipeline; two habits
  could both be sent to a day with room for one; the archive counted a todo
  twice and kept one person's weeks for the next; the review's last line
  could promise a check in for today after tonight's wrap up was done.
- **Known and left as they are.** An old app bundle showed the fixed sign
  off line on a morning whose brief had no offer of its own but had a check
  in or the review to offer (fixed in batch 6: that row has no words now).
  Room for a habit to move counts todos due that day
  and not Laters coming back on it, as the board does. A check in tapped and
  the app closed in the same instant shows their reply with the change not
  made. A habit with days planned in their week still counts as on for today
  on its other days: the due rule does not read the week's plan. The morning
  quick sweep counts a Later back today. Today's rows do not mark a
  milestone step.
- **Found and left for later, all done in batch 6.** After Plan my week
  from the morning brief, Plan my day did not come back by itself when the
  review ended. The evening note's fixed line, used when no model answers,
  spoke of a few things to settle even on a clear day. The old Sweep week
  board had no way in any more. Keep or let go after two pushes, and a Today
  card on the weekly day, were not built here.

What the next batches need to know:

- Batch 6 (done, below) moved the wrap up's cards to the week's Later,
  built keep or let go after two pushes, and took the four things James
  added on 6 Oct: Plan my day comes back after a morning review; the old app
  no longer gets the extra sign off line, so the workers can deploy on their
  own; the evening note's fixed line is neutral; and the Today card on the
  weekly day.
- Deploy order is unchanged, and there is no SQL: inngest-jobs, then cortex,
  then the app. The new app with old workers has no check in and no review
  offer, and nothing breaks.

**The weekly review, batch 6 of 7 (6 Oct): the old Sweep is retired.** The
Sweep screen is gone and only its card deck is left, in a screen of its own.
A todo card now offers Today, Tomorrow, Later and Pick a date, says how full
each day already is, and puts a todo off through the week's Later. A todo put
off twice is asked about before any day is offered. Four things James added
on 6 Oct came with it: Plan my day comes back after the review, the old app
no longer gets an extra line from the new workers, the evening note's fixed
line is neutral, and Today leads with Plan your week on the weekly day. No
migration and no prompt change.

- **The card deck is `app/screens/CardDeckScreen.tsx`**, route `'Cards'`
  with `{ cards: 'wrap' | 'quick' }` (the `'Sweep'` route is gone). It is the
  old screen's deck path and nothing else: every card kind's save, a note
  made into a todo, the multi split step, the hand off to the wrap up
  (`lib/wrapup/session.ts`), close and finish are as they were, and each
  decision is saved as it is made (`applySweepDecision`). The demo no longer
  stands in front of the cards. Nineteen files went: `SweepFlowScreen` and
  its four tests, the intention, hub, habits check in, events and habit card
  steps, `SwipeHintText`, `WeekGridScheduler`, `WeekBoardOverlay`,
  `SweepEndCard`, `SweepEndItemList`, `SweepDemoFlow`,
  `SweepSectionTransition` and `lib/store/weekGridSelectors.ts`. About 680
  lines of the store went with them (the habit adaptation writers, floor
  suggestions, habit reads, `resolveSweepBlock`, `completeSweepSession`,
  `previewSweepGauge`, the demo flag), and the `openTomorrowBrief` event.
- **A todo card's days** are `lib/sweep/cardDays.ts`. Today, Tomorrow and a
  picked date read with how full that day already is ("Tue · 6h"): the open
  todos due on it and the habits planned on it in their week (`loadOn` in
  `workers/shared/habitWeek.js`, which `roomLeft` now uses), without the
  card's own todo, a habit that was put away, or a habit already logged that
  day. The date picker shows the same for the day in hand, under the
  calendar and on its Today and Tomorrow chips.
- **Later on a card is the week's Later.** `keepTodo` in
  `lib/changes/sweep.ts` writes `laterColumns` (`lib/changes/later.ts`): a
  back day, no day of its own, one more push counted, and no reminder. The
  back day is after their week ends, on the day with the fewest things
  already coming back (`laterBackDay`, from `backDays` and `spreadReturns`),
  and the pill names it ("Later · Wed 7"). Later is not offered until their
  weekly day has been read, and the reminder row goes while Later is chosen,
  since a todo put off has no day for a reminder to go by.
- **Put off twice, a card asks first** (`asksKeepOrLetGo`: no day of its
  own, back today or earlier, `resurface_count` of 2 or more). It reads
  "You've put this off twice now. Keep it, or let it go?" and offers no day.
  Keep, by its button or a right swipe, opens Today, Tomorrow and Pick a
  date and saves nothing by itself (`keepOpens` on `SweepCardShell`); only
  Later stays away (`laterOffered`). Let go works from the question.
- **A Later given a day stops being a Later.** `updateTodo` in the store
  clears `resurface_at` when a day is given and the same update does not set
  it. This closes batch 4's note about a day given from a todo's own editor.
- **Try it now on the unlock card opens their first wrap up** in today's
  thread, in place of the demo. The ask for notifications that the app makes
  by itself would land on top of it three seconds in, so it is put off for
  that launch (`putOffOpenAsk` in `lib/notifications/ask.ts`) and comes the
  next time the app opens. "I'll do it tonight" still asks at once.
- **Plan my day comes back after the review.** `useWeekReview` tells the
  thread when the review is over (`onEnded`: after Done, or after the weekly
  day question when that is asked; after Not this week and Not now; and when
  a yes given elsewhere could not open the review at all). The screen then
  calls `continueBrief({ afterWeek: true })`. With `afterWeek`,
  `planOfferToBringBack` looks behind the review's own offers for the day's
  offer and does not count Plan my week chosen on it as an answer. Nothing
  comes back in the evening, in the small hours before their day ends, or
  once the wrap up has spoken. Without `afterWeek` both functions behave as
  they did before this batch, so a turn typed while the review is opening
  never puts the offer back under it.
- **New workers change nothing on the old app.** When the brief has no offer
  of its own, its week facts now ride on a row with no words and no buttons
  (`workers/inngest-jobs/brief/index.js`), where batch 5 used the fixed sign
  off line. The old app draws nothing for that row. Two traces remain: on
  first play the typing dots show for about a second after the day card,
  and when the brief also asks a question the old app adds an unseen copy
  of the row after the answer. The context reader no longer takes a row
  without words as what Gremly had said (`lineBefore` in
  `workers/inngest-jobs/context/reader.js`).
- **The evening note's fixed line**, used when no model answers, is "A look
  back at your day, whenever you are ready, in Chat."
  (`notifications/copy.js`).
- **Today leads with Plan your week on the weekly day**, until the review
  is done or they said not this week (`weekCardToday` in
  `lib/week/review/state.ts`). It is a card where the weekly summary's
  banner sits, in its style, and while that banner is showing it is a button
  on the banner instead (`components/WeeklySummaryBanner.tsx`, prop
  `planWeek`). Only Today passes the prop: the banner on Drop and the Hub is
  as it was. The banner's summary, its X and the button are now three
  buttons side by side, none inside another. The Week button and the card
  follow the store's day, and the week is read again when the day turns
  over with Today on screen.
- **Verified.** tsc clean; 9,703 jest tests in 726 files. On Luna: day set
  31 and 33 of 33 over two runs (the two misses then 10 of 10), week set 18
  and 16 of 18 (the two misses then 9 of 10), wrap 94 of 94, smoke 10 of 10
  twice, weekly read 7 of 7, chat 57 of 57 with and without the week,
  evening note 39 of 40 (one fell to the fixed line when both models
  failed, and it read as above).
- **Found by two independent reads and fixed.** Later dropped a reminder
  chosen before it, without a word; a day's load counted habits already
  logged and habits put away; the custom reminder pill read the due day;
  the notification ask rose over the first wrap up; a turn typed while the
  review was opening brought Plan my day back under it; the offer came back
  after an evening review; Plan my week tapped on a morning when the week
  could not be read left neither button; the banner's buttons could not be
  reached with VoiceOver; the Week button and the card kept yesterday's day
  when the app was left open on Today overnight.
- **Known and left as they are.** A reminder already on a todo stays when it
  goes to Later, as on the board. On the day before their weekly day a Later
  comes back two days on, inside next week if that week was planned early.
  An offer already brought back once and passed by does not come back again
  after a review opened from Today. A talk it through question never
  answered stays the live offer after the review, so nothing comes back
  until they next type. Undo on the Done card reopens the review with the
  brought back offer still live above the board. After a change of their
  day end hour, Today's day lags until the app is next brought forward. The
  unlock card still says "Takes 2 minutes" and "Best done before bed",
  which fitted the demo better than a first wrap up: the words are James's
  to change. Notes' own Resurface later is not the week's Later and is
  unchanged.
- **Nothing makes or ends a habit adaptation now** (until batch 7, below,
  which gives pauses and lighter versions a home again). The old Sweep's habit
  step was the only writer. `habit_adaptations` is still read (streaks, the
  habit card stats, the worker). It has six rows, none running, and every
  row has an end date, so no one is left in a pause they cannot end.
- **Left unreferenced, for a later clean up.** `buildHabitFactSheet`,
  `computeInputHash` and `HabitRead` in `lib/habits/habitFactSheet.ts`, and
  `lib/habits/habitFrequencyRecommendation.ts` behind them; cortex routes
  `habit-read` and `floor-suggest`; tables `habit_reads` and
  `habit_floor_suggestions`; column
  `cortex_preferences.demo_sweep_completed_at`; `useSkipBudget`,
  `getSweepInsight`, `fetchSweepCandidatesForUser`, `applySweepAction`,
  `todoFilters`, `useMiniSweepGate`, `TodayPillsRow`, `NowSweepBar`,
  `SweepDrawer`, `FirstDropSpotlight`, `WRAP_COPY.weekToast`, the
  `'sweep-habits'` help page; the skipped tests in
  `tests/now/now.sweep.test.tsx` and `now.screen.integration.test.tsx` that
  still speak of `navigate('Sweep')`. An install made before this batch
  keeps a stray `demoSweepCompletedAt` key in its saved state until the
  store next saves.

What the next batch needs to know:

- Batch 7 no longer has `resolveSweepBlock` on its list: it went with the
  old Sweep. The summary's cadence detector and the Worlds tab's "this week"
  range are still on Monday to Sunday.
- `loadOn` in `shared/habitWeek.js` is the one place a day's load is added
  up for the cards and for a habit's room. The week's board has its own sum
  (`lib/week/board/model.ts`), which does not leave out a habit already
  logged that day.
- Deploy order is unchanged, and there is no SQL: inngest-jobs, then cortex,
  then the app. The workers of this batch can go out before the app update:
  an app without it shows nothing new.

**The weekly review, batch 7 of 7 (6 Oct): habit weeks, and a habit paused
or on a lighter version.** Habit counts follow the person's own week. A
habit can be paused for a stretch of days or given a lighter version for
them: from the week's board, from a card Gremly offers, and ended from the
habit's own screen. Nothing is committed to a database by this batch except
through the app: the one piece of SQL is for James to run (below).

- **One week everywhere.** A person's week is the seven days that end on
  their weekly day: `weekAround(today, weeklyDay)` in
  `workers/shared/habitWeek.js` (the app's door is `lib/week/habitWeek.ts`).
  Every count toward a weekly target is made in it: Today's list and the
  space rows (`lib/store/selectors.ts`), the day card and the plan
  (`lib/brief/behind.ts`, `useDayCard.ts`, `lib/plan/*`), the wrap up
  (`lib/wrapup/habits.ts`), streaks (`lib/habits/streakUtils.ts`), weeks on
  target (`lib/habits/weeksOnTarget.ts`), the habit screens, the Worlds
  tab's "this week" and its habit grid (`lib/store/worldsSelectors.ts`),
  and in the workers the brief (`brief/data.js`), the daily context
  (`context/daily.js`), `get_day`, and the chat's item lines
  (`cortex/entityMatch.js`). For a Sunday person that is Monday to Sunday
  everywhere, so only Today's list on a Sunday changes for them. The rules
  are in one place: `dayOfWeek`, `weeklyTarget`, `paceFloor`, `behindInWeek`.
- **Their weekly day in the main store.** `useGremlyStore.weeklyDay`,
  saved on the device, read at sign in and with every refresh, and kept in
  step by `lib/week/thisWeek.ts`. The app sends it with every chat turn as
  `weekly_day` (`lib/week/weeklyDayNow.ts`), so a habit's count in a space,
  world or chapter chat is made in their week too.
- **A pause, or a lighter version ("ease" in the code).** Stored in the
  existing `habit_adaptations` table: mode `pause`, or `floor` for a lighter
  version, with `period_start`, `period_end` and `floor_note`. The table
  lets no two stretches of one habit overlap, so there is one planner,
  `easePlan` in `shared/habitWeek.js` (remove, then shorten, then add; the
  way back is the reverse), and one writer, the store's `easeHabit`, which
  is all or nothing and hands back its own way back. A pause, or a lighter
  version with the same words, joins what is already there of its own kind,
  so one unbroken pause is always one row.
- **Paused means leave me alone** (James). Off Today's list, not planned,
  no check in in the brief, no check in push or reminder, never counted as
  behind (a paused day does not count as a day gone), off the board's days
  and the spread, not put on days by the weekly read. A streak holds: a
  paused day never breaks a daily run, and a week with any paused day is
  passed over unless it was met anyway. If they log it, it counts.
- **A lighter version is a note** (James). Days and target stay, a log
  counts in full. The brief, the daily context, `get_day` and the morning
  check in speak of it, in their words when they gave any. It starts from
  the habit's saved smallest version (`habits.floor_note`).
- **On the board.** The Habits tab has two chips under each habit, "Pause
  this week" and "Lighter version", and a field for the lighter version's
  words (`components/week/WeekBoard.tsx`). Like every move on the board,
  neither is saved until Done (`WeekBoardMoves.habit_ease`,
  `BoardHabit.ease`, `BoardDiff.eases`, `easeHabitOnBoard` in
  `lib/week/board/model.ts`; written by `saveBoard`). What was last tapped
  is what shows. A paused habit stays in the list with no days. The stretch
  is the days the board plans. The same chips are in Change your week. The
  spread is told what they chose (`ownMoves.habit_ease`).
- **On a card.** A new change kind, op `ease`, with `ease.mode` pause,
  lighter or usual, `ease.from`, `ease.until`, `ease.note`
  (`shared/changes/check.js` `checkEase`, app `lib/changes/ease.ts`). With
  no days it runs from today to the end of their week, or over the days
  being planned during the review. It starts today or later and ends within
  four weeks. Usual ends one stretch (the one running, else the next to
  come), from today or from a day given, which is how a pause is made to end
  sooner; a pause given a last day inside a longer pause is read the same
  way. A pause accepted on a card also takes the habit off the days it was
  planned on in the stretch, and Undo puts them back. A day inside a pause
  is turned away for `habit_days` (`day_paused`).
- **Only an app that can apply it is offered it.** The app sends the habits
  eased now with their week (`week.eased`, from `easedFor` in
  `lib/week/review/state.ts`). Only then does the request get the
  `week_ease` variant (`weekVariant` in `agent/brief.js`, tool sets
  `brief_week_ease` and `chat_ease`), in today's thread and in Ask Gremly.
  An older build never sees the op. A turn that answers a question of
  Gremly's is not offered it either.
- **Where the model is told about it.** Everything is on the change's own
  `ease` field in the tool's schema (`easeField` in `proposeChanges.js`).
  The tool's description is the same with and without it. A paragraph added
  to the description cost other turns their card (below).
- **Where a pause shows.** The habit's own screen has a banner with the
  days and Back to usual (`src/components/habits/HabitEaseBanner.tsx`); the
  Habits list says Paused in place of the check in status. Your week and
  Past summaries leave a paused habit off the days of its pause.
- **Today card words** (James): "A few minutes with Gremly to set up your
  week."
- **SQL for James to run, before the workers.** The summary's cadence
  detector counted habit weeks from Monday whatever the weekly day. This
  buckets them in the person's week (the same weeks as before when
  `p_week_start` is a Monday). Only the two `date_trunc` lines change:

  ```sql
  CREATE OR REPLACE FUNCTION public.summary_detect_cadence_calibration_mismatch(p_owner uuid, p_week_start date, p_week_end date)
   RETURNS jsonb
   LANGUAGE sql
   STABLE
  AS $function$
    with wk_habits as (
      select id, title, target_per_period as tgt
      from habits
      where owner_id = p_owner and cadence = 'weekly'
        and coalesce(archived,false) = false and target_per_period >= 3
    ),
    weekly_counts as (
      select h.id, h.title, h.tgt,
             (p_week_start + 7 * floor((hp.occurred_day - p_week_start) / 7.0)::int) as wk, count(*) as cnt
      from wk_habits h
      join habit_progress hp on hp.habit_id = h.id and hp.owner_id = p_owner
      group by h.id, h.title, h.tgt, (p_week_start + 7 * floor((hp.occurred_day - p_week_start) / 7.0)::int)
    ),
    per_habit as (
      select id, title, tgt,
             count(*)::int as weeks_observed,
             count(*) filter (where cnt >= tgt)::int as weeks_hit,
             round(avg(cnt),1) as avg_per_week
      from weekly_counts group by id, title, tgt
    ),
    scored as (
      select *, case when weeks_observed > 0 then round((weeks_hit::numeric / weeks_observed),3) else 0 end as hit_rate
      from per_habit
    ),
    qualifying as (
      select * from scored where weeks_observed >= 10 and hit_rate < 0.40
      order by hit_rate asc, weeks_observed desc
    )
    select jsonb_build_object(
      'fired', (select count(*) > 0 from qualifying),
      'fill_input', jsonb_build_object(
        'habits', coalesce((select jsonb_agg(jsonb_build_object(
            'title', title, 'target', tgt, 'hit_rate_pct', round(hit_rate*100)::int,
            'weeks_observed', weeks_observed, 'avg_per_week', avg_per_week)) from qualifying), '[]'::jsonb),
        'worst', (select jsonb_build_object('title', title, 'target', tgt,
            'hit_rate_pct', round(hit_rate*100)::int, 'avg_per_week', avg_per_week,
            'weeks_observed', weeks_observed) from qualifying limit 1)
      ),
      'evidence_snapshot', jsonb_build_object(
        'habit_ids', coalesce((select jsonb_agg(id) from qualifying), '[]'::jsonb),
        'min_hit_rate', (select min(hit_rate) from qualifying)
      ),
      'score_components', jsonb_build_object(
        'qualifying_count', (select count(*) from qualifying),
        'candidate_count', (select count(*) from scored),
        'min_hit_rate', (select min(hit_rate) from qualifying)
      )
    );
  $function$;
  ```

- **Verified.** tsc clean; 9,907 jest tests in 736 files. On Luna: day set
  33 of 33, and 31 of 33 as a build that can pause sends it (`--with-ease`;
  the two misses fail at the same rate with the week alone); week set 24 of
  25 and 25 of 25; chat 48 of 48, 48 of 48 with the week, 47 of 48 with
  ease; wrap 93 of 94 (the check that reads "No phone in bed" as tonight,
  as before); smoke 10 of 10; weekly read 8 of 8; brief corpus 36 of 36;
  evening note 39 of 40. `--with-ease` is new on the day and chat replays:
  every scenario is sent their week with the habits eased now.
- **Found by replay.** With a paragraph about ease added to
  `propose_changes`'s description, a turn that answers the wrap up's
  question said its change without putting it on the card far more often
  (6 of 15 against 3 of 25). All of it moved to the `ease` field's own
  description, and that turn is no longer offered ease at all. That
  scenario (`wrap-answer-fixes-item`) still misses about one time in six
  whenever the week's tools are on, with or without this batch: it is not
  fixed here.
- **Found by five independent reads and fixed.**
  - The store never loaded the days habits are planned on: the read was made
    at sign in and dropped, and the refresh did not make it (since June).
    After any restart the app knew of no planned habit day, so no morning
    check in and nothing "planned for today". `habit_plans` is now read at
    sign in and with every refresh, and kept on the device.
  - Pauses were not kept on the device, so a paused habit was back on Today
    on a cold start until the refresh landed, and a failed read wiped every
    pause. Both are kept now, and a read that fails keeps what is held
    (`rowsOrHeld`).
  - A card kept in the database came back with the fields of each object in
    another order, and the app compared them as text, so every card that
    ended or changed a running pause failed as "changed since". Compared a
    field at a time now (`lib/changes/ease.ts`), and so is a habit's
    schedule (`staleField` in `lib/changes/apply.ts`, the same cause, older).
  - A pause asked for inside a longer pause split it into three rows and
    said a last day that was not true; the board lit a chip that a tap could
    not turn off, and threw away an edited lighter note; an Undo that failed
    once could never succeed; a card accepted days later paused days already
    gone; a lighter version with no words given wiped the words it had; the
    best streak could read lower than the current one; Past summaries
    counted a paused habit as planned and missed; the spread did not know of
    a pause chosen or ended on the board; a pause that could not be read let
    the brief check in on a paused habit.
- **Known and left as they are.**
  - An app build from before this batch, on a weekly day other than Sunday,
    sees the workers' counts in their week while its own screens still count
    from Monday, until it updates.
  - That older build, asked in Ask Gremly to pause a habit, can put the
    habit's end day on the card while saying pause. It was so before this
    batch; a build with this batch gets `ease`.
  - A pause made on the board that covers today does not take the habit out
    of a day plan already made in today's thread.
  - During the review, the habits eased that Gremly is told of are the saved
    ones. A pause chosen on the board and not yet saved reaches him only as
    the habit being on no day.
  - A saved pause that holds only part of the week shows on the board as
    closed days; it is ended from the habit's own screen.
  - Back to usual on the habit's screen does not put back the days a pause
    took off; Undo on a card does.
  - Usual on a card ends one stretch. One set for later stays, and is the
    next one the habit's screen shows.
  - `context/daily.js` and `entityMatch.habitProgressWords` each keep a
    target rule of their own that differs slightly from `weeklyTarget`;
    `inngest-index.js` still sends the table's own mode names as `ADAPTED:`
    in the daily picture.
  - The rolling seven day dots (`useWeeklyHabitStats`) are days, not a week,
    and are unchanged. `habit_plans.week_start` is still the Monday of the
    planned day: it is bookkeeping, and the read begins a week earlier.
  - More than forty habits eased at once would not all reach Gremly.
  - Old em dashes in `app/spaces/SpaceHomeScreen.tsx` were not touched.

What comes after this batch:

- Deploy order: the SQL above, then inngest-jobs, then cortex, then the app.
  The workers can go out before the app update: an older app is never sent
  `ease`, and what it is sent keeps its shape.
- The plan's seven batches are built. James audits batch 7 before testing
  on device, and device feedback on batch 4 is still to come.

**The fix batch after batch 7 (7 Oct, `various-fixes-10.4`).** Seven items
James asked for before testing on device, one commit each so any one can be
reverted by itself. The commits were made from the index a hunk at a time,
because several files are shared between items; each staged file was parsed
before its commit, and the type check and the full test suite were run on
the finished tree.

- **1. A row on a change card opens its item (`d8143891`).**
  `components/brief/ChangeCard.tsx`: the words of a row open the item
  (`rowsOf` gives each row its item, looked up in the store, and looked up
  again at the tap). On an open card the box alone is the tick. A row with
  no item (a set time, the week's shape, an item not made yet, one put
  away) is as before. Applying a card keeps the item each row made on the
  message (`created`, from `lib/chat/useChatCard.ts` and
  `lib/brief/applyChanges.ts`), so a new item's row opens it afterwards.
  In an item's own chat (`openChangeItem` in `app/tabs/AskGremlyScreen.tsx`)
  a row about that item closes the chat onto it; a row about another item
  closes the chat and opens that one, and for a habit the overlay under the
  chat is closed first (`useOpenEntity`'s `overOverlay`).
- **2. An open item follows changes made from its chat (`00f3c79e`).**
  `components/overlay/draftRefresh.ts` and `refreshFromItem` in
  `useOverlayDraft.ts`. The overlay listens to the store while it is open.
  When its item changes, every part of the draft the person has not touched
  takes the new value; notes they have typed in get what was added put on
  the end (and taken off again if the add is undone); the snapshot Save
  builds on takes the fields that changed. Before this, a Save after a chat
  change wrote the old draft back over it, history line included. The
  overlay's own Save is skipped (`ui.saving`), since its way back after a
  failed save would otherwise undo their edits, and a change is taken once
  when two overlays share the draft (the cards screen mounts its own).
  There was no update banner in the code: the history card stays.
- **3. Plan my day counts the gaps (`856936c3`).** `planRoom` in
  `lib/plan/planFlow.ts` places the picks as the plan would and says
  `spaced` (with the minutes left, gaps counted), `tight` (two or more
  picks that all fit only with no gaps) or `over`. The sheet shows it
  (`roomWords`); Add something uses `addRoomFor`. On `tight`, `planPicked`
  asks back to back or with some space (offer kind `plan_spacing`, the
  picks kept on the message). `planSpacing` makes the plan: back to back
  with `buffer: 0`, which is kept on the plan (`BriefPlanMeta.buffer`) and
  passed by every later fit. With some space keeps the gaps; `sayUnfit`
  names what did not fit and offers the todos among it the next day or
  Later (`plan_unfit`, handled by `moveUnfit` through `checkChange` and
  `applyChanges`). Only the newest offer in a thread has live buttons, so
  the suggested changes under the plan wait until that offer is answered.
  A typed message past the spacing question brings it back once
  (`planOfferToBringBack`, `backToSpacingStep`).
- **4. Break habits are out of the pick sheet and the plan (`21b034e6`).**
  App: `isBreakHabit` in `lib/plan/candidatePool.ts`, used by
  `pickItemsOf` and `candidateFromStore`. Workers: the app sends
  `breaking: true` and the note "a habit they are breaking" on the day's
  items; `plan_add` refuses one (`plan_breaking`), the old engine gives one
  no time and no plan row, and the brief's `candidates` and `planned` leave
  them out. A request without the flag is read as before. Today: the All
  Day section now draws Stay mindful for break habits with no time of day
  (it drew an empty header). Wrap up: on Just the journal, the break habits
  get a card of their own after the journal (`after_journal` on the card;
  the wrap up stays at `declined`; saving the card says good night), and
  `break_asked` keeps the habits card from asking again that day.
- **5. Today files an item under its planned time (`722e1c59`).**
  `lib/now/sectionFor.ts`: a time planned for today first (by their Time
  Blocks settings, the rule `plannedTimePatch` writes the block by), then
  today's saved order, then the block. The saved brief is used only when
  it is today's. `localDateOf` in `lib/brief/time.ts` now always reads a
  moment: a planned time on the stroke of UTC midnight was read as the next
  day's. A moved item in a plan on Today writes its block with its time.
- **6. No MindDrop logo on the Add to Today sheet (`6f00d5bc`).**
- **7. The wrap up's answer card (`3e3d86b7`).** The cause was the wording
  of the answering block in `wrapContext` (`workers/cortex/agent/brief.js`):
  "already saved to what Gremly knows" read as the matter being closed. It
  now says saving the answer changes no item, puts the case that changes
  nothing first, and keeps the change to the item asked about. Day replay
  on Luna, `wrap-answer-fixes-item` with the week on: 18 of 30 before, 24
  of 24 after (15 of 15 without the week); `wrap-answer-no-change`: 24 of
  24 and 15 of 15, with no call to the card. A first rewording that put the
  card rule first fixed the card and made the no change turn call
  `propose_changes` 19 times in 20, so it was replaced. The week's job
  text in `surfaces.js` was tried too and put back as it was: the fix does
  not need it. The agent's version is `brief-2026-10-08b`.

Checked at the end: tsc clean; 9,987 jest tests in 745 files; wrap replay
93 of 94 (the old "tonight" check on a break habit's line), smoke 10 of 10,
weekly read 8 of 8, brief corpus 36 of 36; day set 32 of 34, 34 of 34 with
the week and 31 of 34 with ease; week set 25 of 25 both ways; chat 47, 46
and 47 of 48.

- **The replays were noisy on 7 October.** Every full run missed one to
  three scenarios, different ones each time, none of them the scenarios
  this batch touches. The committed code of the day before did the same in
  the same hour (week 24 of 25, day with the week 32 of 34). For one
  scenario (`ease-usual` in chat) the request body was compared byte for
  byte between the two versions of the code: identical, yet 27 of 32
  against 20 of 32. So a gap of that size between two arms is not evidence
  by itself. James's rule for this batch: do not tune against it.
- **Three independent reads of the diff** found, and this batch fixed: the
  overlay's own Save going through the refresh (a failed save lost their
  edits); a change applied twice with two overlays mounted; the break
  habits' card leaving the wrap up stuck at the habits step, and asking the
  same habit twice in a night; a todo moved to tomorrow staying in the plan
  when a fit since the offer had placed it; the spacing question asked
  about one pick, and its picks lost to a typed message; "or put off for
  later" asked with no Later button; the first rewording of item 7 making
  the no change turn slower.

Noticed and not changed (James, 7 Oct: fix only within the seven items;
anything else is a note here):

- `updateTodo` leaves `body` stale in the store after the overlay saves a
  todo's notes: Save sends `details`, the rename to `body` happens only on
  the way to the database (`lib/store/useGremlyStore.ts`, the optimistic
  write and the rename near the top of the file; `overlaySave.ts` writes
  `details`). Reopening before a refetch shows the old notes, and a chat
  add on top would then write the old notes plus the add over the saved
  edit. Found by a review read; reproduced there, not fixed.
- `habit_days` in `workers/shared/changes/check.js` accepts a break habit,
  so a card can plan one on days; it then shows as planned for today. The
  board never offers it. `checkEase` already refuses one.
- A break habit still shows as something to do in: Due today
  (`DueTodaySheet`) and the day card's "N today"; `get_day`, which does not
  read `subtype` and prints it as daily and not done; the brief writer's
  HABITS FOR TODAY when it has set weekdays or planned days; the Calendar
  screen, which draws one with a part of day as a 30 minute block.
- Today's last fallback for a section reads words in the item's name
  (`inferTimeWindow` in `NowScreenV1.tsx` and `timeBlockHelpers.ts`). That
  is pattern matching on their words, and older than the rule.
- The plan card's "still X free" (`planSummary`) does not count gaps, so
  it can read higher than the Add sheet beside it.
- Opening another todo or note from a chat that sits on an overlay
  replaces that overlay and drops its unsaved draft without a word (entity
  cards did this already; change card rows now do too).
- A plan message made by an older build that already holds a break habit
  keeps it until the day is over.

Known and left:

- Not tonight with no further tap, or with tonight's journal already
  written, shows no check in for break habits: they said no to the wrap up.
- A typed answer to back to back or with some space goes to Gremly's day
  turn, which does not hold the picks; the question then comes back once
  with its buttons.
- A back to back plan also has no gap beside meetings.
- An app build from before this batch does not send `breaking`, so until it
  updates Gremly can still offer a break habit a place in the plan.
- Each of the seven commits was parsed, not type checked, by itself. Item
  3 sits on files the others touch, so revert it first when reverting more
  than one.

What comes after this batch:

- Deploy order: no SQL. inngest-jobs, then cortex, then the app. The
  workers can go out before the app update.
- James tests on device; device feedback on batch 4 is still to come.

**Closing fixes (7 October, in the reviewing chat).** Four commits on top of
545b81c8, from the fix batch's notes, and nothing else changed:

- 74b0a11a: `updateTodo` holds a todo's notes in `body` in the store too
  (the overlay's Save sends `details`), so reopening shows the saved notes
  and a chat add can no longer write the old notes over the edit.
- 06952701: Today's last fallback no longer reads words in an item's name
  (`inferTimeWindow` in `NowScreenV1.tsx` and `timeBlockHelpers.ts`); with
  nothing it holds to go on, an item goes under Anytime.
- 0f93a1cf: the habit days change refuses a break habit (`days_breaking`).
- 11d35560: one rule, `isBreakHabit` in `workers/shared/habitWeek.js`, used
  by both sides. A break habit is out of the day card's habits for today
  (Due today and "N today"), its behind and planned lists, the brief
  writer's habits for today, the calendar's blocks, and `get_day`, which now
  reads subtype and says it is one they are breaking, with whether they
  checked in as kept clear. The brief no longer names break habits at all;
  Today's Stay mindful and the wrap up check in keep them in sight.

Checked: tsc clean, all 745 jest files pass, day replay 57 of 59, chat 69 of
72, brief corpus 18 of 18. `ease-usual` in the chat replay passes about one
run in three today, on 545b81c8 as on these commits (6 runs each, side by
side): "back to usual" from a message is weak and worth a look later; the
habit screen's Back to usual button does not depend on the model.

**Step 11, focused model audit.** After chat and Sweep, a smaller audit of
only the places that could be better, from replays and real use: a stronger
model for harder jobs where it earns its cost, `none` thinking on a bigger
replay (on today's thread it scored 54 of 57 at about 2.5s against low's 51
to 53 at about 3.2s, but its replies were sloppier), and Gemini caching.

## Decisions James has made (keep to them)

- One agent core, each surface with its own job. Not a rebuild.
- The AI may change any main field of any item, through the change model.
  Worlds and Chapters replaced Spaces. Rarely used fields (part of the day,
  Worlds, Chapters, tags, pinned, favourite) only change when the person asks
  for that field; never suggested, never asked about.
- Turning one kind of item into another: built in step 3.
- Lock ins and commitments: removed from the app in the Sweep redesign
  (`sweep-updates-10.04`). The columns stay. What is left on Gremly's side is
  listed in `docs/agent/SWEEP_STEP10.md`, rows 15 and 16.
- Every change needs a tap; a card with several changes has Accept all.
- Habits whose label and tracking disagree: list them; Gremly asks when it is
  unclear (Sweep redesign) and updates from the answer.
- The field list is one file both the app and the workers read.
- Budgets per surface: in the steps 1 and 2 doc. Brief card in 6s typical,
  10s slow; chat agent lane 10s slow, up to 3 cents a message; 10 cents a
  person a day all in.
- Usage logging in cortex works (checked on James's chats of 2 October: one
  run_id per message, user_id set, `first_chunk_ms` on the reply). Small
  loose ends: the Tavily row's job has no step and no cost, and the running
  summary is written twice for about half of chat messages (look at it in
  step 9; it runs after the reply).

- Lanes (step 6): a change only hinted at stays quick (the item match still
  offers its card); something new they say they need to do, accepting
  Gremly's offer of a change, and following up a change never made are
  agent; telling Gremly about themselves or correcting it is quick; when
  unsure, quick; quick covers the last three days. Today's thread has no
  triage: from step 7 every message goes to the agent. Triage runs on Luna
  in one call, switched on with step 6; James judges the tone in the app.
- Today's thread (step 7): every message goes to the agent on Luna, with web
  search on the brief too; the composer holds a message while Gremly works
  rather than losing it. Asking and timing (James's note on an anniversary
  present): Gremly asks when the answer would change what it does or what it
  understands about them and what matters to them, one question at a time,
  and anything that gets them ready for a later date is due before it, never
  on the date itself. Rules only, no examples; the replay has two date
  scenarios. Whether to reuse the day turn's check on replies that sound done
  is an open question in the step 7 doc.
- Agent replies get no dash cleanup for now (the brief writer's `noDashes`
  turns any dash into a comma, which reads wrong in a time range). The
  persona settles dashes in steps 7 and 9, the replays count slips,
  and a cleanup comes only if they still happen: one that writes a range as
  "to" and logs every time it fires.
- James is staying in this session on Fable rather than switching models at
  step 6; this file still holds everything a fresh session would need.
- Steps 1 to 7 are merged to main (PR #144, f8de3b13), and step 9 (PR #145,
  ba101d14). Step 10 is on `sweep-updates-10.04`. James merges, deploys
  (inngest-jobs, then cortex) and builds when he chooses.
- Model audits (James, 3 Oct): no separate bake-off before each surface;
  start each surface on what works, and audit in one focused pass after chat
  and Sweep.
- Ask Gremly's agent lane (James, 4 Oct): on for his account until Sweep is
  done; straight after step 10, `AGENT_CHAT = "on"` for everyone, before the
  TestFlight build (set in `wrangler.toml` on `sweep-updates-10.04`). The quick
  lane's card and the item matcher swap follow it.
- The wrap up (James, 4 Oct): Gremly writes the opener and the close fresh,
  with typing dots; anything typed in the wrap up goes to him; counts and
  buttons stay fixed.
- The weekly review (James, 6 Oct): after a typed message the review shows
  Carry on and never moves on by itself, and a `hold` only hides that button
  until they have answered. The read ahead is for everyone the pipe runs for,
  with the four week rule kept in the code, switched off. Every read is at
  medium effort, the midweek extra's too. A review started in its
  window and reopened later resumes where it was with the same read, and does
  not use the extra. An out of cycle review counts as the new week's when
  they move their weekly day at Done.
- Their own days in the weekly review (James, 6 Oct): days they gave their
  todos are kept and the spread plans around them. With many, the board asks
  once (Keep my days, Keep some, Rearrange it all), showing each day's load
  first. Keeping them never means keeping an over-full day in silence: each
  one gets a card of suggested moves, picked by the model in one call beside
  the spread and checked by code, and their own todos move only if they
  accept. For batch 6, the card deck's day picker shows how full each day is.
- The come back note (James, 6 Oct): it goes to anyone with Reminders on,
  not only people with Notes from Gremly on, because it is about their own
  items.
- The brief's extra line on the old app (James, 6 Oct): the old app no
  longer gets the extra "Have a good day." line, so the workers can deploy
  on their own.
- The card deck (James, 6 Oct): a todo card offers Today, Tomorrow, Later
  and Pick a date. Later goes through the week's writer and shows its back
  day on the pill. The day pills and Pick a date show how full each day
  already is, for example "Tue · 6h". After two pushes the card asks keep or
  let go; Keep opens Today, Tomorrow and Pick a date, and only Later goes
  away.
- Try it now (James, 6 Oct): it opens their first wrap up, and the demo
  sweep is gone.
- The Today card (James, 6 Oct): on the weekly day Plan your week is a card
  at the top of Today in the summary banner's style. When the weekly summary
  banner is showing on the weekly day, it is a button on that banner instead
  of a second card.
- Plan my day comes back after a morning review (James, 6 Oct).
- The evening note's fallback line is neutral (James, 6 Oct), with nothing
  about things to settle.
- A paused habit (James, 6 Oct): "leave me alone". Off Today's list, no
  check ins or nudges, never counted as behind, off the board's days, and
  its streak holds. If they log it anyway, it still counts.
- A lighter version (James, 6 Oct): a smaller version that counts. They say
  what it is in a few words, starting from the habit's saved smallest
  version. Days and target stay, a log counts in full, and Gremly and the
  check in speak of it.
- Where Gremly can offer a pause or a lighter version (James, 6 Oct):
  today's thread and Ask Gremly, and only to app builds that know the new
  kind, so the workers can deploy first. The review's Habits tab has "Pause
  this week" and "Lighter version".
- One week everywhere (James, 6 Oct): Today's list counts in the person's
  week too. For a Sunday person that is Monday to Sunday, so only Today's
  list on a Sunday changes.
- The Today card's words (James, 6 Oct): "A few minutes with Gremly to set
  up your week."

## How to work here

- Writing: no dashes as punctuation, anywhere (prompts, UI words, commit
  messages, docs). Plain English, warm, never consultant language.
- Prompts: semantic rules only. No examples, no word lists, and no pattern
  matching anywhere in the AI path unless James has confirmed it. Never put
  examples from his own data into a prompt to make a test pass.
- Never hide an issue behind a guard; tell James about it.
- App code: DateService for dates (no bare `new Date()`), the Zustand store
  for app data, Lucide icons, mockup is spec, nothing switched on only in
  development builds.
- A corpus or replay run comes before any prompt or model change.
- Git (Cowork): the step 10 worktree is mounted at
  `$HOME/mnt/sweep-updates-1004` and the main repo at `$HOME/mnt/gremly-mob2`;
  git needs
  `export GIT_DIR=$HOME/mnt/gremly-mob2/.git/worktrees/sweep-updates-1004 GIT_WORK_TREE=$HOME/mnt/sweep-updates-1004`.
  `various-fixes-10.4` is checked out in the worktree
  `gremly-mob2.worktrees/morning-brief-fixes-102` (ask for that folder; its
  GIT_DIR is `.git/worktrees/morning-brief-fixes-102`).
  Never stash, check out or do anything that unlinks files on the mount; edit
  in place. When another session has files staged in the same worktree, commit
  only your own with `git commit -o <paths>`.
  The mount cannot delete, so git leaves its lock files behind: a plain
  `git status` leaves `index.lock`, and a commit leaves `HEAD.lock` and
  `next-index-*.lock`, and a lock left in place stops every other git command
  in that worktree. Read with `GIT_OPTIONAL_LOCKS=0` set, and after any
  command that writes, move the locks it left into `.git/claude-stale/`.
  Commit as James with `HUSKY=0` (lint-staged cannot run under GIT_DIR) and
  the attribution trailers your session gives you:
  `HUSKY=0 git -c "user.name=James Woolmer" -c user.email=woolmerjames@gmail.com commit`.
  Run prettier and eslint by hand on what you change. Never run
  `git worktree prune`. James pushes, deploys (gremly-inngest-jobs first, then
  cortex, wrangler name gentle-thunder-5854), merges and builds.
- Supabase (project pvfnnpcfmgczlcglvlzl): `apply_migration` times out because
  the approval never reaches James. Write the migration file and give him the
  SQL; read only checks with `execute_sql` are fine.
- Tests: `timeout 175 npx tsc --noEmit -p tsconfig.json`; jest from the repo
  root, `npx jest <paths> --modulePathIgnorePatterns=.claude`. A shell call is
  cut at about three minutes, so run jest in chunks (workers, lib, components,
  parts of `__tests__`); background processes do not survive the call. A
  replay has to fit in one call too, so use `--only` and `--repeat` to size
  it.
- To measure a prompt change against the last commit without checking
  anything out: `git archive HEAD workers scripts lib | tar -x -C $HOME/cmp`,
  link `node_modules` into it, and run the same replay from there beside the
  working tree. Ten runs of the one scenario on each side says more than
  three runs of the whole set.
- Model keys for smoke runs and replays come from
  `$HOME/mnt/gremly-mob2/.audit-keys.local` (Gemini test project and OpenAI;
  no Anthropic key): `set -a && . <(grep -E '^[A-Z_]+=' $HOME/mnt/gremly-mob2/.audit-keys.local) && set +a`,
  then `NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1 ESBUILD=$HOME/tools2/node_modules/@esbuild/linux-arm64/bin/esbuild bash scripts/agent-smoke/run.sh`.
- Files written into the worktree from the cloud side can take a moment to
  show in the shell. Check a file is the new one before formatting or testing
  it, or prettier can write the old content back.
- Committing a file to the device from a staged path used earlier in the session
  can write the earlier copy. Stage each new version under a new file name,
  then check the file on the device (size or a word you added) before going on.
- James likes a plan or write-up as a Claude Doc, short chat replies that link
  to it, and decisions asked as a short table with a lean.
