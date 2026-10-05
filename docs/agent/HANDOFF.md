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
  Never stash, check out or do anything that unlinks files on the mount; edit
  in place. When another session has files staged in the same worktree, commit
  only your own with `git commit -o <paths>`.
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
  parts of `__tests__`); background processes do not survive the call.
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
