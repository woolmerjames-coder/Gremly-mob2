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
- Left on Monday to Sunday, for batch 7 with the habit weeks: the summary's
  cadence detector (`summary_detect_cadence_calibration_mismatch` buckets
  habit weeks with `date_trunc('week')`), the Worlds tab's "this week" range
  (`components/worlds/WeeklySummaryCard.tsx`), and the old Sweep's
  `resolveSweepBlock`, which goes in batch 6.
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
  `readEffort` is low for the midweek extra and medium for everything else.
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
- The weekly read at low effort, which the midweek extra now uses: 6 of 7 on
  the whole set and 5 of 8 on the health scenario, against 22 of 22 at
  medium. It used a word from their own habit's name, and once gave a todo
  again as a milestone step. James asked for low; it is in the hand over for
  him to rule on, and `readEffort` is the one place to change.

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
  with the four week rule kept in the code, switched off. The midweek extra's
  read is at low effort and the read ahead at medium. A review started in its
  window and reopened later resumes where it was with the same read, and does
  not use the extra. An out of cycle review counts as the new week's when
  they move their weekly day at Done.

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
