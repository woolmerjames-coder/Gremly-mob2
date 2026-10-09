# Mind Drop rethink: handover and build notes

This file has two parts. The first is the handover from the planning chat (7 to 9 October 2026), written for the model that builds this. The second, at the bottom, is where the builder adds a short note after every stage.

Read this whole first part before touching code. Then read the plan.

## Where everything is

- **The plan:** the live Claude Doc, [Mind Drop Rethink Build Plan](https://claude.ai/code/artifact/660c1468-78ad-41a8-8035-bb76b419f571). A copy as of 9 October is beside this file, `docs/2026-10-minddrop-rethink-plan.md`. If the two disagree, the Claude Doc wins. The plan has twelve stages, each with what is true today, what to build, tests, the gate and how to roll back.
- **The spec:** the prototype. `Claude outputs/mind-drop-prototype.html` opens in any browser and is complete (refreshed on 9 October to the final version, with the quiet duplicate line and settle at 4.0s; an older copy said settle 3.8s and had no duplicate line). It is also published at [Mind Drop Rethink](https://claude.ai/artifact/5ypYU7pQgKTFm5AfEgQgxS). Its CSS holds every card token, its `T` table the timings, and its script every moment: A simple drop, Obvious split, Unsure split, Unclear drop, Already have it (the run), Already on your list (the duplicate) and A feeling. Every look, timing and word on a card comes from it. When the plan and the prototype disagree, the prototype wins and you say so in your stage note. The decisions of 9 October stand wherever the prototype does not show them: Something else on every question, the bubble never asking anything, and people and tags off the card.
- **The relate replay** behind stage 1: `Claude outputs/already-have-it-replay.html` (the review page) and `scripts/relate-replay/` (the runner). That folder is not in git yet: commit it on the branch in stage 1. Its own `.gitignore` keeps `real/` and `results/` out.
- **The classifier audit harness:** `scripts/minddrop-audit/` (see its README, and the baseline command in the plan's Before you start). Its data (real beta drops) is gitignored and is not in the main checkout. Copy it in before the baseline: `cp -R .claude/worktrees/gate-base/scripts/minddrop-audit/data scripts/minddrop-audit/ && cp -R .claude/worktrees/gate-base/scripts/minddrop-audit/round2/data scripts/minddrop-audit/round2/` (the same files sit in every worktree). Compare runs with `cd scripts/minddrop-audit/round2 && node test-report.mjs "Worker: base37" "Worker: v38"`.
- **The prompt replay that came with the data fabric:** `scripts/minddrop-prompt-replay/` (`title|reclassify|details|time|summary|search --old <module>`). Stage 2 extends it. Its `run.sh` bundles with a macOS esbuild that fails in the VM, so run it with node and the audit loader from the repo root: `set -a; . ./.audit-keys.local; set +a; NODE_USE_ENV_PROXY=1 node --no-warnings --import ./scripts/minddrop-audit/loader.mjs scripts/minddrop-prompt-replay/run.mjs title --old <absolute path to the old module>`. Before editing a prompt, save today's `minddropPrompts.js` as the old module under `scripts/minddrop-prompt-replay/old/`.
- **Real drops for the stage 2 replay:** James's account `05a3c53d-b242-4b5f-a0db-83004c8e3892` and the main beta tester's `c64ec85f-735c-4d5c-859a-1ac6630aebb3` (the J and T accounts in `scripts/relate-replay`).
- **House rules:** `CLAUDE.md` at the repo root, plus the rules James set for this build. The ones that matter most here are repeated below.

## What this build is, in short

Mind Drop is the most important page in Gremly. The planning chat measured it, prototyped a new version with James, and James locked every decision. The build changes four things.

1. **The order of work, for speed.** From `ai_usage` over 60 drops (3 to 7 October), a typical drop today shows its kind at about 2.0s, its title at 4.0s, its details at 6.3s, is saved at 6.7s, and keeps changing on screen until about 7s (10s at the slow end). The calls run one after another: the title waits for the classifier, the details wait for the title, the save waits for the details, filing waits for the save. The new order starts every call the moment it can: the title and the reaction at the tap, the details when the classifier answers, the save at the sort, filing straight after the save. Target: sorted at about 2.0s (2.9s slow end), settled at about 4.0s (6.2s slow end), then the card stays still.
2. **The card.** Look A from the prototype: a kind tile that fills in when sorted, a sentence case title, one meta line (kind word, when, how long, how often, mood for a journal, where it lives). The cheeky second line (the card note) goes; it was never saved anyway. Your words are the card from the first frame, with one quiet sign that Gremly is working.
3. **Asking.** Today questions come through popups, a checkbox split modal and a separate Sweep split step; Skip silently clears a question for good; 281 old questions sit unanswered and 89 multi drops wait to be split. After this build there is one way to ask: a strip on the card with one tap answers, arriving with the sort or the settle, never later. Not now means one thing everywhere. Same as this one? becomes a quiet line. Obvious multi drops split themselves.
4. **Cost.** The already have it check moves from Gemini 3.8 Flash to GPT-6 Luna at low reasoning, under its own model setting. A drop goes from about 0.69¢ to about 0.37¢ (0.62¢ once Google's January price applies). Classification accuracy stays as it is, 97.5 drops in 100 on the locked set, on purpose.

Models after the build: classifier Gemini 3.8 Flash with Luna backup (0.25¢); already have it check Luna low (0.03¢); details Luna (0.03¢); Worlds filing Luna (0.03¢); question words Claude Sonnet, about 1 drop in 11 (0.02¢ averaged); title and reaction Luna (0.01¢).

**The relate replay result** (628 real drops, two runs each): Luna at low reasoning matched Gemini on the questions that stay on the card, caught two finished jobs Gemini missed, and missed about 6 duplicates Gemini caught. Run to run spread on the 66 drops that matter: right 18 to 20, missed 6 to 8, wrong 0 to 2. Duplicates now only feed a quiet line, so a miss means a duplicate stays, never a wrong merge.

**Bugs found on the way,** fixed in this build: the classifier's remind me flag is set in `lib/minddrop/phase1.ts` (386) but never copied onto the drop, so automatic reminders never run; Title Case code lowercases acronyms (Sage FY26 became Fy26); a too long title is replaced by the drop cut mid word at 50 characters; the card note is held only in memory; the filing answer was only logged (the data fabric now stores it; nothing shows it yet); the relate answer is paid for and thrown away on multi drops; Undo does not restore reminders (`restoreTodo`, `uncompleteTodo`, `restoreHabit`); Skip on a question marks it resolved so it never comes back; and the v2 fallback chain still runs a word list check (`mightBeMulti`).

## Decisions and the reasons behind them

All of these are locked. Do not reopen them; if one turns out to be impossible, stop and tell James.

| Decision | Why |
| --- | --- |
| Card look A, every existing animation kept, nothing below 12 points | James wanted the cards to look smart rather than amateur while keeping the animations he likes; 12 points is the accessibility floor. |
| No card note; Gremly's reaction in the speech bubble carries the fun | Two voices said the same thing twice. The bubble arrives with the sort and never repeats the card. |
| Titles: the thing itself, in the user's words, sentence case, names and acronyms as typed; when, how often, how long and feelings left out; rewritten only when long or messy | Each of those details has its own place in the meta line and can change; in a title it goes stale ("Run 3 times a week" after the habit changes). Title Case broke acronyms. A detail left out of a title must have been caught by the details, or it vanishes, so the replay checks it. |
| Gremly's bubble never asks the user anything | A question makes Mind Drop look like a chat; people answer in their next drop, which the classifier then treats as a conversation and asks about. Empty box greetings that invite a drop stay, because the right answer to them is a drop. |
| Title and reaction start at the tap, without the kind | That is most of the speed gain. The prompt works out the kind itself when none is given; the replay checks quality before it ships. |
| Save at the sort; details and filing added when they land | The card is real straight away, and filing starts about 3s earlier. |
| Splits: the classifier says clear or unsure. Clear unzips with Keep as one; unsure asks with the pieces shown; an unclear piece asks its own question | Splitting the obvious saves work; asking when unsure avoids silent mistakes. Fallback if the classifier cannot tell them apart reliably: `CLASSIFY_SPLIT_AUTO = "false"` makes every multi drop ask, until the clear list James reads is clean. |
| One question strip on the card; it arrives by the settle or waits for Sweep | Questions that arrive late interrupt; popups and modals were heavier than one tap. |
| Not now: kept as it is, Sweep asks once more, the morning quick sweep once if the wrap up is skipped, then it lapses | One meaning everywhere, and nothing nags forever. |
| Same as this one? is a quiet line with Keep just one and Undo, then the wrap up, then the morning quick sweep once, then it lapses with both items kept | A duplicate is not urgent; nothing is ever merged without a tap. |
| Something else (free text) on every clarify strip | In case the question Sonnet writes misses; it uses the same path as today's free text answer. |
| People and tags off the drop card | The one meta line has no room; they stay on the item's own screen. |
| Already have it check on Luna low, its own model setting `MODEL_DROP_RELATE` | About a tenth of the cost; chat's matcher keeps `MODEL_ENTITY_MATCH` on Gemini. |
| Classifier stays on Gemini 3.8 Flash | It is the strongest part; this build does not touch accuracy. |
| About 2 and 4 seconds is fast enough | No further speed work in this build. |
| The v2 Worker routes stay until no sessions on older builds for two weeks | Builds already out still call them. |

## How to work in this setup

- **Where the code is.** The repo is on James's Mac, reached through the Cowork device shell (`device_bash`) at `$HOME/mnt/gremly-mob2`. The cloud container cannot see it. Work on the files there.
- **Command limits.** Each `device_bash` call is a fresh shell with a 180 second cap, and background processes die between calls. Split long jobs into chunks that write their results as they go and can resume.
- **Tests.** `npx jest <path>` works in the VM (about 20 to 30s for a small file, mostly start up). Worker tests run from the root config too: `npx jest workers/cortex/__tests__/<file>`. A full run will not fit in one call, so run it by folder (for example `lib`, `app`, `components`, `workers`) and add the results up. `npx tsc --noEmit` runs clean on main in about 25s. Record the failures that already exist on main as your baseline before changing anything.
- **Node.** Node 22. API calls from node need `NODE_USE_ENV_PROXY=1`. Anything in `node_modules` with a macOS native binary (esbuild, for one) fails in the Linux VM with Exec format error, so run scripts with plain node (the audit harness uses `--import ./loader.mjs`).
- **Keys.** `.audit-keys.local` at the repo root holds `OPENAI_API_KEY`, `GEMINI_TEST_API_KEY` and `ANTHROPIC_API_KEY`. Never print them. The audit harness reads `GEMINI_API_KEY`, so export it from `GEMINI_TEST_API_KEY` as the plan shows.
- **Deleting and git.** Deleting files in the connected folder is off until James allows it, and git needs it (it removes its own lock files, and checkout replaces files). At the very start, ask once with `device_request_delete_permission` for the gremly-mob2 folder, saying git needs it for the branch and commits. Without it, the first commit leaves `.lock` files that break later git commands.
- **Git.** Make the branch from main (`b716b7ee` or later), suggested name `minddrop-rethink-10.9`. Commit at the end of each stage, or more often, with plain messages. Never push, merge or deploy: James does those.
- **Supabase.** Project `pvfnnpcfmgczlcglvlzl` (Gremly-mob2), through the Supabase MCP, for read queries and exports only. Large results land in a file: check the export with md5. `SHADOW_SUPABASE_KEY` returns 401, so do not use it. Never apply a migration; give James SQL as single copy and paste blocks.
- **What only James can do:** run the simulator, make EAS builds, deploy the Workers, push, merge and run SQL. Tell him exactly what to run and why.
- **Old copies of the repo.** `.claude/worktrees/` holds nine old checkouts. Exclude it from every search (jest already ignores it), or greps will find stale code.
- **Untracked files.** The two `docs/2026-10-minddrop-rethink` files and `scripts/relate-replay/` are untracked on main. Commit them on the branch in stage 1, and leave other untracked files (such as `assets/gremly-splash.png`) alone.
- **The Today rebuild comes after this one.** James is building this first, in the main checkout. The Today rebuild (`docs/2026-10-today-rebuild.md`, branch `today-rebuild-10.9`) starts once this is merged and builds on top of it, so you do not need a worktree. Its docs sit untracked in `docs/`: leave them alone. If the two ever do run at the same time, never switch branches in one checkout: build this one in its own worktree (`git worktree add .claude/worktrees/minddrop-rethink-10.9 -b minddrop-rethink-10.9 main`, then `ln -s ../../../node_modules .claude/worktrees/minddrop-rethink-10.9/node_modules`).
- **When the plan is wrong.** Write the correction under Plan corrections in your stage note and carry on, unless it changes a decision, in which case stop and ask James. Do not edit either copy of the plan; the planning chat folds corrections in later.

## The gates, and what to hand James at each

Stop at each of these and wait for James.

1. **Before stage 1:** the delete permission, and your baseline (jest failures on main, the v3.7 locked set run `base37` after copying the audit data in, the `ai_usage` timing baseline).
2. **Stage 1 done:** the Worker change for James to deploy (`MODEL_DROP_RELATE = "gpt-6-luna"`), and how to check it worked in `ai_usage`.
3. **Stage 2:** the words replay page, `Claude outputs/words-replay.html`, with the counts on top and every case where a detail left out of a title was not caught by the details. `TITLE_RULES` and `REACTION_RULES` are shared with the reclassify prompt, so run the replay's `reclassify` part too. James reads it and says yes; no code check decides tone.
4. **Stage 3:** the locked set report against `base37`, every drop whose answer changed, and the list of splits marked clear. James reads the clear list and decides `CLASSIFY_SPLIT_AUTO`.
5. **Stage 4 diff:** before James tests, have a second model read the stage 4 diff cold and fix what it finds. Use the Agent tool with a model other than your own (Sonnet or Fable, for example); if you cannot, tell James and he will run the review in another chat. Note what it found in the stage note. Also give James the stage 4 Worker change to deploy first (`write_question: false`, deploy table row 4).
6. **After stage 6:** the branch ready for James to run in the simulator with stages 4 to 6, and the list of prototype moments to play side by side (A simple drop, Unclear drop, Already have it, Already on your list, A feeling), plus airplane mode, killing the app mid drop, and a drop that reports a finished todo.
7. **After stage 8:** the same for stages 7 and 8 (Obvious split, Unsure split), including Not now, the wrap up, a skipped wrap up and the morning quick sweep. Stage 9's filing replay goes to James here too.
8. **Stage 12:** the fresh model audit against the prototype. Then James brings the branch back to the planning chat for the final delivery check.

At every stop, send James one short message: what changed, test results against the baseline, what he needs to do (deploy, build, read or run SQL) and where the stage note is.

## House rules that bite in this build

These are `CLAUDE.md` plus the rules James set for this build.

- **No dashes as punctuation** in anything written: prompts, UI strings, docs, stage notes and commit messages.
- **No examples and no pattern matching, anywhere the AI makes or shapes a decision.** This has gone wrong before, so it is the rule to hold hardest. It covers prompts (no worked examples, sample drops, word lists or phrases to look out for, and never real user data) and code on either side of the model (no regex, keyword lists or heuristics that decide or change what a drop is, says or becomes). Prompts state semantic rules only. If you think one is needed, stop and ask James; never add one yourself, even as a fallback or a guard. Counting things in a replay report or a test is fine, because it never changes what a user sees. This build removes two that exist (the reaction's filler word and Ooh or Oh strips) and retires a third with the v2 chain (`mightBeMulti`). The only code that stays on model output is what James agreed: the dash swap and the reaction's length cut, both logged whenever they fire. The prompt tests enforce it (`classifyV3.test.js` 27 to 63 today, and the new `minddropPrompts.test.js` in stage 2).
- **Never hide an issue behind a guard.** The one backstop that stays, the reaction's dash swap, logs a `console.warn` every time it fires.
- **Dates through DateService; app data in the Zustand store; Lucide icons** (lucide-react-native 0.545: the question icon is `MessageCircleQuestionMark`).
- **The approved mockup is the spec.** One known gap: React Native cannot blur text on iOS, so the title crossfade uses opacity alone.
- **Nothing switched on only in development builds.**
- **A corpus or replay run before any prompt or model change.**
- **James pushes, deploys, merges and builds; SQL as single copy and paste blocks.**
- **Nothing removed without an impact audit first** (stage 11 says how).
- **Gremly's bubble never asks the user anything.**
- **Every Worker change must keep the app builds already out working.** Old builds never send `piece_questions`, `write_question: false` or a missing bucket, and they cope with a missing `card_note`.

## Things that will trip you up

- **The prompts moved.** The data fabric merge put the drop prompts in `workers/cortex/minddropPrompts.js` (`titleReactionPrompt`, `titleReactionUser`, `reclassifyPrompt`, `detailsPrompt`, with shared `TITLE_RULES`, `CARD_NOTE_RULES`, `REACTION_RULES`). The routes and their post processing are still in `workers/cortex/cortex-index.js` (`enrich-phase1-5a` from 9739, `enrich-phase2` from 9954, `classify-v3` from 8723, `minddrop-relate` from 8695, `clarify-ambiguity` from 8940, `reclassify-after-clarification` from 9010, `assign-worlds` from 10383).
- **Two title helpers.** `titleCase` (3598) lowercases everything after the first letter; `sentenceCase` (3631) only capitalises the first character. Both are nested inside the request handler (from about 3288) and not exported, so stage 2 moves `sentenceCase` and the fallback cut into an exported `workers/cortex/titles.js` to test them, and moves every live caller to it. `processPhase2Response` (3877) is never called, and the title helpers around it go in stage 11.
- **The title route's extras.** It turns a missing bucket into log (`body.bucket || 'log'`, 9744), so remove that default for no bucket to reach the prompt. It also adds a fixed opener (Got it., It's on my list.) to the reaction at random (`OPENERS`, about 9860 to 9925) and cuts a reaction over 70 characters (about 9843). Stage 2 says what happens to each.
- **The classifier's versions.** `CLASSIFY_PROMPT` is not set in `wrangler.toml` today, and `buildClassifyV3Prompt` builds v4.1 and v4 on the default base. Once v3.8 becomes the default, v3.7 would vanish and the next Worker deploy from the branch would run v3.8 before its gate. Stage 3 freezes v3.7 and sets `CLASSIFY_PROMPT = "v3.7"` until James switches it.
- **A multi drop's kind.** The normaliser sets a multi drop's `bucket` to the first piece's kind and `dominant_bucket` to the most common one, and drops the model's own top level outcome. Stage 3 keeps it as `as_one`, which an unsure split is saved as.
- **`drop_id` is unique per owner** on todos, habits and notes, archived rows included, and the 23505 path returns the existing row. Pieces get `split-<localId>-<index>` and Keep as one's note `kept-<localId>`, or a piece disappears without a trace.
- **Habits are not in Sweep today.** `sweepCandidatesAsOf` and `sweepCount.js` handle todos and notes only; stage 8 adds habits that have a live ask.
- **Filing earlier sees less.** `assignDropToGraph` sends the details' tags, people and date when it has them; at the save it will not. Stage 9 has a filing replay for James before it ships.
- **Days.** Every day an ask counts uses the person's day: DateService in the app, `personDay` with `dayEndHour` (`workers/shared/day.js`) in the Worker.
- **Where Mind Drop's popups live.** Mind Drop opens them through `contexts/OverlayContext.tsx` (handlers 345 and 377, popups drawn at 719 and 731); Sweep draws its own (`CardDeckScreen.tsx` 1313, 1325); the item overlay `UnifiedOverlayV2.tsx` draws only ClarificationPopup (6706).
- **Line numbers** in the plan were checked against main at `b716b7ee` on 9 October. Find each function by name before editing.
- **Kinds.** The app has todos, habits and notes; events, journals and ideas are notes with a subtype. `ENTITY_TYPES` in `lib/minddrop/dropRelation.ts` already lists all three tables. Today a related drop is held as a note until answered; after stage 4 it is saved as its own kind at once.
- **Clarification fields** exist both as columns (`needs_clarification`, `clarification_resolved`) and inside `views`, on notes, todos and habits. Read both.
- **Sweep's two halves.** `lib/sweep/quickSweep.ts` and `workers/inngest-jobs/notifications/sweepCount.js` must count the same cards; their headers say so. Give them shared test fixtures.
- **The classifier flag.** The app's `FEATURE_FLAGS.CLASSIFY_V3_ENABLED` comes from `EXPO_PUBLIC_CLASSIFY_V3`, which every `eas.json` profile sets to on; the Worker has its own `CLASSIFY_V3_ENABLED`. When stage 11 removes the v2 fallback, the Worker var must stay "true".
- **Prompt versions.** `PROMPT_VERSIONS` in `classifyV3.js` is `['v3.7', 'v4.1', 'v4']` and a test needs `PROMPT_VERSION` to equal the first entry, so v3.8 goes at the front.
- **Old data** (7 October): 281 items with an unanswered question (277 notes, 2 todos, 2 habits; 21 people; the newest from 8 September) and 89 notes waiting on a split (7 people). Stage 8 lets them lapse quietly and gives James the SQL.
- **expo-updates** is installed with the app version as the runtime policy, so a JavaScript only release could go out as an EAS Update. That is James's call.
- **Cost check after the build:** `ai_usage` should show `minddrop-relate/drop_relate` on `gpt-6-luna` and chat's `entity_match` still on `gemini-3.8-flash`.

## How to write a stage note

Add one section per stage below, newest last:

```
### Stage N: name (date)

What changed: the files, in a sentence or two each.
Tests: what ran, and the result against the baseline.
Deviations: anything that differs from the plan or the prototype, and why.
Plan corrections: line numbers or facts in the plan that were wrong.
For James: exactly what he needs to do now (deploy, build, read, run SQL), or nothing.
Blocking questions: only if you cannot go on without an answer.
```

Keep it short and plain. No dashes as punctuation.

## Stage notes

(The builder adds notes here.)

### Baselines before stage 1 (9 October)

What changed: nothing tracked. Branch `drop-page-revamp-10.9` made from main at `b716b7ee`; James asked for this name in place of `minddrop-rethink-10.9`. The audit data was copied in from `.claude/worktrees/gate-base` (gitignored). The locked set was split into ten parts of 100 (`data/test2p00.json` to `test2p09.json`, gitignored) because a run of 1,000 does not fit in one three minute call, and the parts were merged into `results/v3w_base37_test2.json`, which `round2/test-report.mjs` reads as `Worker: base37`.

Tests:
- jest on main, in 15 chunks of 55 files: 785 suites and 10,996 tests, none failing; 521 tests skipped (76 suites wholly skipped, 28 suites with focused tests). This is the bar for every stage.
- `npx tsc --noEmit` on main: clean.
- Locked set, v3.7 through the Worker route (`base37`, the plan's command): accuracy 97.6%, 16 wrong without asking, 8 needless questions, multi found 33 of 35, pieces right 72 of 76, answers cover intent 64 of 71, typical 2.0s, p90 3.3s, p99 4.9s, $2.54 per 1,000 drops, 1.2 calls per drop, no failures, 26 drops answered by the backup. The two multi drops it missed (n0241, n0554) both have todo as an acceptable answer.
- `ai_usage` timing for the last 60 drops (5 to 9 October), seconds from the tap, middle then slow end (p90): kind 1.92 and 3.00; already have it 2.17 and 3.72; title 4.17 and 5.54; details 6.24 and 8.30; filing 10.12 and 12.42. Method: `created_at` is when a call ends, so each `classify-v3/reply` start is its end less its latency; the tap is the earlier of that and the relate call's start; title, details and filing are the first `enrich-phase1-5a`, `enrich-phase2` and `assign-worlds` rows for the same person within 15, 20 and 30 seconds of the kind. Before 7 October those four jobs carry no user id, so those drops were matched on time alone.

Deviations: the branch name, and the locked set run in ten parts one after another rather than in one go.

Plan corrections:
- Stage 3's gate asks for multi found 34 of 35 or better and pieces right 74 of 76 or better. Today's v3.7 run gives 33 of 35 and 72 of 76 (the September audit gave 34 and 74 in both its runs), so the bar sits above today's own result.
- The plan copy beside this file still has the old house rules line in its Summary; the live doc (rev 89) has the tightened one.

From James on 9 October, by message: stage 11 also removes the STOP_TAGS word list (`isStopTag`) and `parseDaysFromText` from the details route (`enrich-phase2`), once the replay's details part shows habit days and tags are no worse, fixing any miss with a semantic rule in the details prompt; both stay where chat uses them. Only the dash swap and the reaction's length cut may act on model output.

Decided by James on 9 October: stage 3's bar stays as written, 34 of 35 multi drops found and 74 of 76 pieces right, so v3.8 has to beat today's v3.7 run on both.

For James: read the baselines and say go for stage 1.

Blocking questions: none for stage 1. Asked ahead of stages 2, 3 and 7: whether `sentenceCase` on the model's title, the title fallback to the drop's own words, the `as_one` fallback to the first piece's kind, `CLASSIFY_SPLIT_AUTO` and sentence case on split pieces may stay under the rule that only the dash swap and the length cut act on model output.

### Stage 1: the already have it check on Luna (9 October)

What changed: `workers/cortex/models.js` gains the `drop_relate` job on `MODEL_DROP_RELATE`, which falls back to the shared helper model when unset. `workers/cortex/minddropRelate.js` calls `helperFetch('drop_relate', ...)` with `reasoning_effort: 'low'`, so `ai_usage` logs it as `minddrop-relate/drop_relate`. `workers/cortex/wrangler.toml` sets `MODEL_DROP_RELATE = "gpt-6-luna"` beside `MODEL_ENTITY_MATCH`, which stays on Gemini for chat, and the Mind Drop comment no longer says the check shares chat's matcher. `docs/minddrop-relate.md` says the same. This commit also adds `scripts/relate-replay/` (its `.gitignore` keeps `real/` and `results/` out) and the two `docs/2026-10-minddrop-rethink` files.

Tests: two new tests in `workers/cortex/__tests__/minddropRelate.test.js`: the check runs on `MODEL_DROP_RELATE` at low reasoning while `MODEL_ENTITY_MATCH` is Gemini, and with no setting it takes the helper model, never chat's matcher. Both failed before the change and pass after. Related tests for the changed modules (`--findRelatedTests`): 21 suites, 387 tests, all passing. `tsc` clean.

Step 4, the drop after the item list so Luna can cache the list: built, replayed and not shipped. Luna low runs 3 and 4 with the drop last, scored with one method for all four runs against the replay page's own verdicts on the 66 drops where answers differ, debatable ones left out: right 8 and 12 against 16 and 17 for runs 1 and 2; missed 23 and 23 against 17 and 11; wrong 1 and 0 against 1 and 0. Across all 628 drops it asked on 62 and 64 against 71 and 79, and it turned clear time changes into Same as (Dentist is at 4pm now, not 3pm; Vet moved to Thursday at 4). My counting does not reproduce the page's totals exactly (the page gives runs 1 and 2 as 18 and 20 right), so the four runs are compared with each other, not with the page. The order stays as it is, with a comment in `buildRelateInput` saying why. Runs 3 and 4 are in `scripts/relate-replay/results/` (gitignored).

Deviations: step 4 not shipped, as above. Testing changed with James's agreement: each stage runs `tsc`, its own new tests and the related tests for every file it changes; the full jest run happens after stage 6 and at stage 12.

Plan corrections: none. Every line in stage 1 matched main.

Rebased after the commit: main moved at 10:34 on 9 October (PR #149, Worlds finish, `d353168a`), which changed the cortex Worker's chat code and `WORLDS_OLD_FIELDS`. A deploy from the old base would have undone it, so the branch now sits on `d353168a`. #149 touches no Mind Drop route, so `base37` still stands, but every `cortex-index.js` line the plan gives after about 7266 is now about 280 lower (`classify-v3` at 8446, `enrich-phase1-5a` at 9462). Related tests and `tsc` pass again on the new base.

For James: deploy the cortex Worker from `workers/cortex` (`npx wrangler deploy`). Then make one drop that says you finished one of your open todos, and check its card still asks Mark it done. Tell me when it is deployed and I will check `ai_usage` for `minddrop-relate/drop_relate` on `gpt-6-luna` and chat's `entity_match` still on `gemini-3.8-flash`. Rollback: set `MODEL_DROP_RELATE = "gemini-3.8-flash"` and deploy.

Confirmed after James deployed (9 October, 18:47 UTC): his test drop that reported a finished todo ran `minddrop-relate/drop_relate` on `gpt-6-luna` (2.1s), proposed the todo done, and the answer was applied. Chat's matcher had no call since the deploy; `MODEL_ENTITY_MATCH` is unchanged.

Blocking questions: none.

### Stage 2: the title and reaction call, without the kind (9 October)

What changed:
- `workers/cortex/minddropPrompts.js`: the title prompt works out the kind itself when none is given, and `titleReactionUser` sends `BUCKET` and `SUBTYPE` only when there is one. `TITLE_RULES`, shared with reclassify: the thing itself in their own words, rewritten only when long, rambling or messy, with how long it takes now left out too, and sentence case in place of Title case. The card note rules, section and output field are gone. `REACTION_RULES`: never asks or invites a reply, never says what kind of item it became, no dashes; the variety rule moves between statements and exclamations only. Version `minddrop-prompts-2026-10-18b`.
- New `workers/cortex/titles.js`: `sentenceCase` (moved out of the request handler), `fallbackTitle`, `dashBackstop` and `lengthBackstop`, each logging a `console.warn` when it fires.
- `workers/cortex/cortex-index.js`, `enrich-phase1-5a`: no `'log'` default for a missing bucket; the model's title gets `sentenceCase` and is kept at any length; the drop's own words stand in only when the call fails or gives no title; the filler word and Ooh or Oh strips are gone; the dash swap and the 70 character cut stay, logged; the fixed openers are gone, so `speech_message` is the reaction itself; no `card_note` in the reply. `reclassify-after-clarification`: the same title handling, and its reaction gets the same two logged backstops (50 characters).
- `scripts/minddrop-prompt-replay/`: `run.mjs` gains `title --real` (real drops from `real/drops.json`, gitignored, with the details call and a judge of anything left out of the title that the details do not hold; resumable into `out/real-title.jsonl`), judge questions for the new rules, and the new prompt run without the kind. New `report.mjs` writes `Claude outputs/words-replay.html`. Today's prompts are saved as `old/minddropPrompts-2026-10-09.js`.

Tests: new `minddropPrompts.test.js` (no dashes, no examples, sentence case, no card note, no reaction rule that invites a question, the no dashes rule, the kind only when given) and `titles.test.js` (sentenceCase keeps LLMO, SFDC, FY26 and UK; the fallback cuts at a whole word and keeps an over long single word whole; every backstop logs): 26 tests, written first and failing before the change. All cortex Worker tests: 42 suites, 733 tests, passing. `tsc` clean.

The words replay (the gate): 320 real drops from both accounts (289 from the last 45 days plus every habit and 30 older events, so 47 events), exported with the Supabase MCP, md5 checked; the made up title set twice and the clarify set twice. Against today's prompt as the app showed it:
- Reactions that ask anything: 0 against 178. Dashes in the reaction: 0 against 18 (an earlier run without the no dashes rule had 8, so the rule went in and everything ran again). Reactions over 70 characters: 1. Capitals changed: 0 against 15. Fallback titles: 0. Short drops given a word they did not type: 0.
- Left out of the title and not caught by the details: 43 drops of 100 with something left out. 42 of them were already lost under today's prompt, which also leaves times and feelings out of titles; only "before work" is new. They fall in a few groups: a clock time on a todo (the details call has no time for a todo), a part of the day on a todo or an event, a repeat on an event or todo (no field for it), a feeling on anything but a journal (mood is for journals only), how long on a journal, and some judge over reach on long drops.
- Judge checks, before and after: title adds nothing 316 and 319; title leaves out when, how often, how long and feelings 311 and 305; title keeps their words 308 and 319; reaction about this drop 257 and 275; reaction sounds like a friend and never restates the title 281 and 252; reaction asks nothing 142 and 320. Most of the voice drop is the judge reading a reaction that names the thing (Kasablanca at the Castro, that should sound huge) as restating the title. The prototype's own bubble lines do the same (The booster jab. The vet will be thrilled.).
- 27 new titles run over 8 words or 60 characters, kept as written; most come from drops of 9 to 11 words.

Deviations:
- The judge ran on GPT-6 Sol, not Sonnet: Anthropic's API returns 401 from the VM's proxy (Node also needs `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt` to reach it at all).
- The title length line reads at most eight words (two to eight before) and reclassify's at most seven (three to seven before), so a one word drop keeps one word rather than gaining words to reach the minimum.
- The title route no longer drops a reaction under 3 characters or a title under 3 characters: under the rule that only the dash swap and the length cut act on model output, only an empty answer is replaced.
- Reclassify's reaction now also gets the logged dash swap; before it had only the cut.

Plan corrections:
- Phase 2's event title is not thrown away: `dropSync.ts` saves it as an event's title in place of the title call's. James chose (9 October) that every kind uses the title call's title: stage 4 stops `dropSync` replacing it, and stage 11 removes the field from Phase 2 after checking nothing else reads it.
- `cortex-index.js` lines after #149 sit about 280 lower: `enrich-phase1-5a` at 9462, the bucket default at 9467, the title handling near 9505 to 9522, openers near 9583, reclassify's titles at 8792 and 8877.
- The details prompt (`detailsPrompt`, `TIME_ESTIMATE_RULES`) still carries example lists the tightened rule forbids: priority_kind's "such as a reply, an approval or a delivery", the activities listed under each energy type, and the task types listed in the time estimate. Not changed here; for James to place.

From James on 9 October: `sentenceCase` and the fallback stay as formatting; the fallback only for a failed or empty title call, cut at a whole word near 60, logged; no over 60 trigger. Events use the title call's title.

For James: read `Claude outputs/words-replay.html` and say yes or what to change. Two calls are yours: whether the details call should catch what it misses now (a todo's clock time, parts of the day, feelings outside journals), as a separate replayed change to the details prompt, together with its example lists; and whether reactions that name the thing are fine, as in the prototype, or the rule should be tightened and the replay run again. Do not deploy until you say yes; then deploy the cortex Worker from `workers/cortex` with `npx wrangler deploy`. Rollback: redeploy the previous Worker; the app copes with either reply.

Blocking questions: the two calls above.
