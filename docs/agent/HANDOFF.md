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

| Step | What                              | Status                            |
| ---- | --------------------------------- | --------------------------------- |
| 1    | Map what exists (reuse map)       | Done                              |
| 2    | Measure today, budget per surface | Done                              |
| 3    | One change model                  | Done                              |
| 4    | The tools                         | Done                              |
| 5    | The core loop                     | Done                              |
| 6    | Triage update                     | Done                              |
| 7    | The brief on the core             | Next                              |
| 8    | Replay suites and model choice    |                                   |
| 9    | General chat on the core          |                                   |
| 10   | Sweep on the core                 | After the Sweep redesign is built |
| 11   | Rollout and watching              |                                   |

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

Nothing calls `runAgent` yet.

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

**Step 7, the brief on the core.** The day turn today: the app builds a
`DayTurnRequest` (`lib/brief/useDayTurn.ts` `buildDayTurnRequest`), cortex
proxies `type: 'day-turn'` to inngest-jobs (`/api/day-turn`,
`brief/dayTurn.js`). The natural path: a cortex route that takes the same
request, builds the persona from the care rules and the day as
`renderTurnInput` already renders it, calls `runAgent({ surface: 'brief' })`,
streams `onStatus` lines, and returns the reply, the card as change model
changes and the task list. The app then draws the card from `Change[]`
(`lib/changes/words.ts` `rowWords`) and applies with `applyChanges` from
`lib/changes/apply.ts`; plan effects as `applyDayChanges` works them out now.
Store the task list on the daily thread's metadata. Fall back to the day turn
when the agent returns `ok: false`. The brief's plan tools (fit something into
the day, move it in the plan, using plan pick and the slot fitter) belong here.
The smoke run showed what the persona has to settle, as semantic rules: no
markdown headers, no emoji, no dashes even in a time range, and offering what
is on the card in Gremly's own voice rather than talking about "a card".
This is where James first tests the agent in the app (simulator).

**Step 8, replays.** Grow `scripts/agent-smoke` into multi turn replays per
surface. Compare four models: gpt-6-luna (low effort), Gemini 3.5 Flash-Lite
(low thinking; independent tests measured about 9s to first word at default),
Gemini 3.8 Flash (promo price until 31 Dec 2026, then double), Claude Sonnet
5.5 (no Anthropic key yet, and the agent has no Anthropic client yet). Score
per job, not overall. Also compare `find_items` against the whole-list matcher
(`entityMatch.js`) before the quick lane moves to the search. One writer per
surface: the words the person reads come from one model on that surface.

**Step 9, general chat.** Triage's agent lane goes to `runAgent({ surface:
'chat' })` with the persona from `gremlyPersona.js` and the preload from
`buildChatContext`; the quick lane stays as today. Chat's one change card
(`components/chat/EntityCardMessage.tsx`) and the list card become one
component here.

## Decisions James has made (keep to them)

- One agent core, each surface with its own job. Not a rebuild.
- The AI may change any main field of any item, through the change model.
  Worlds and Chapters replaced Spaces. Rarely used fields (part of the day,
  Worlds, Chapters, tags, pinned, favourite) only change when the person asks
  for that field; never suggested, never asked about.
- Turning one kind of item into another: built in step 3.
- Lock ins and commitments: off limits; they are being removed with the Sweep
  redesign.
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
- Agent replies get no dash cleanup for now (the brief writer's `noDashes`
  turns any dash into a comma, which reads wrong in a time range). The
  persona settles dashes in steps 7 and 9, the step 8 replays count slips,
  and a cleanup comes only if they still happen: one that writes a range as
  "to" and logs every time it fires.
- James is staying in this session on Fable rather than switching models at
  step 6; this file still holds everything a fresh session would need.
- All of this is on `morning-brief-fixes-10.2`; James merges and builds when
  he chooses.

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
- Git (Cowork): the worktree is mounted at `$HOME/mnt/morning-brief-fixes-102`
  and the main repo at `$HOME/mnt/gremly-mob2`; git needs
  `export GIT_DIR=$HOME/mnt/gremly-mob2/.git/worktrees/morning-brief-fixes-102 GIT_WORK_TREE=$HOME/mnt/morning-brief-fixes-102`.
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
