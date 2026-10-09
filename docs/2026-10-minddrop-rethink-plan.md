> A copy of the live Claude Doc, [Mind Drop Rethink Build Plan](https://claude.ai/code/artifact/660c1468-78ad-41a8-8035-bb76b419f571), taken on 9 October 2026 for reading when the doc cannot be opened. If the two disagree, the Claude Doc wins. The handover is beside this file, docs/2026-10-minddrop-rethink.md.

# Mind Drop Rethink Build Plan

Oct 7, 2026 · @James Woolmer

## Summary

This build puts the locked Mind Drop prototype into the app: the new card, the faster order of work, automatic splits, one way to ask, the quiet duplicate line, and the already have it check on GPT-6 Luna. The spec is the prototype, [Mind Drop Rethink](https://claude.ai/artifact/5ypYU7pQgKTFm5AfEgQgxS), also saved as `Claude outputs/mind-drop-prototype.html`. Every look, timing and word on a card comes from it; when this plan and the prototype disagree, the prototype wins and the builder says so. The decisions of 9 October stand wherever the prototype does not show them: Something else on every question, the bubble never asking anything, and people and tags off the card.

- **Branch:** a new branch from main, suggested name `minddrop-rethink-10.9`. The data fabric (`data-fabric-revamp-10.6`) was merged to main on 9 October (PR #148, `b716b7ee`), so nothing waits on it any more.
- **Builder:** Opus 5.5, working one stage at a time. Each stage ends with its checks passing and a short handoff note in `docs/2026-10-minddrop-rethink.md`. Stages 1 to 3 change prompts or models and stop at a gate for James. Stage 4 (the pipeline reorder) is the riskiest; a second model reads its diff before James tests, as with the data fabric.
- **Order:** the worker stages (1 to 3) ship first and also help the app builds already out. The app stages (4 to 10) follow in order. Clean up (11) and the final audit (12) close it.
- **House rules** (CLAUDE.md, plus the rules James set for this build): no dashes as punctuation anywhere written; prompts use semantic rules only, with no examples, no word lists and no pattern matching in the AI path unless James confirms; never hide an issue behind a guard; dates through DateService; app data in the Zustand store; Lucide icons; the approved mockup is the spec; nothing switched on only in development builds; a corpus or replay run before any prompt or model change; James pushes, deploys, merges and builds, and gets SQL rather than applied migrations; nothing removed without an impact audit first; Gremly's bubble never asks the user anything; every Worker change keeps the app builds already out working; SQL comes as single copy and paste blocks.
- **Targets:** the card lands at 0s, is sorted at about 2.0s (2.9s slow end) and settled at about 4.0s (6.2s slow end); a drop costs about 0.37¢ now and 0.62¢ from January.

## What James locked

These are settled; the build follows them and does not reopen them.

| Area | Decision |
| --- | --- |
| Card | Look A: a kind tile, a sentence case title, one meta line (kind word, when, how long, how often, mood for a journal, where it lives). Every animation kept. Nothing below 12 points. |
| Second line | The cheeky card note goes. Gremly's reaction in the speech bubble carries the fun, arrives with the sort and never repeats the card. |
| Titles | The thing itself, in the user's own words, in sentence case, with names and acronyms exactly as typed. When it happens, how often, how long and how they feel are left out, because each has its own place on the card and can change. Otherwise rewritten only when the drop is long or messy, never adding anything. A detail left out of a title must have been caught by the details, or it would vanish. |
| Gremly's bubble | Never asks the user anything or invites a reply, so no one mistakes Mind Drop for a chat and answers in their next drop. Statements only: after a drop, after an answer, on an error and in growth moments. The empty box greetings that invite a drop stay. |
| Loading | Your words are the card from the first frame. No italics, shimmer, Organizing or breathing border: one quiet sign that Gremly is on it. |
| Speed | Title and reaction start at the tap; details start when the classifier answers; save at the sort; filing straight after the save; the already have it check never holds up the title. About 2 and 4 seconds is the target; no further speed work. |
| Multi drops | The classifier says clear or unsure. Clear unzips into its pieces with Keep as one; unsure asks on the card with the pieces shown; an unclear piece asks its own question. The checkbox modal and the Sweep split step go. If the classifier cannot yet tell clear from unsure reliably, every multi drop asks on its card until it can. |
| Asking | One question strip on the card with one tap answers, for unclear drops, unsure splits, done, log, change, add and remove. Every clarify question ends with Something else, a one line box, so a weak question never leaves anyone stuck. It arrives when the card is sorted or settled, never later. Not now keeps the item as it is and Sweep asks once more; if the wrap up is skipped, the morning quick sweep asks once; then Gremly lets it go. |
| Duplicates | Same as this one? is not a question on the card. The drop files as normal with a quiet line, You already have this, and Keep just one (with Undo). If left: a question card in the wrap up; if that is skipped, the morning quick sweep once; then it lapses and both items stay. Nothing is merged without a tap. |
| People and tags | Off the drop card; they stay on the item's own screen. |
| Already have it check | GPT-6 Luna at low reasoning, with its own model setting so chat's matcher stays on Gemini 3.8 Flash. |
| Classifier | Gemini 3.8 Flash stays, with Luna as its backup. |
| Old Worker routes | The v2 routes stay until Expo shows no sessions on older app builds for two weeks. |

## Before you start

Start with the handover, `docs/2026-10-minddrop-rethink.md`: why each decision was made, the evidence behind it, how to work on James's Mac, and what to hand James at each gate. A copy of this plan sits beside it as `docs/2026-10-minddrop-rethink-plan.md`. Then read the spec and the current code before writing anything, and take baselines so every stage can be compared with today. Line numbers in this plan were checked against main at `b716b7ee` on 9 October. Files move, so always find a function by its name before editing, and note any number that is off in the stage note.

**Read first**

1. The prototype source, `Claude outputs/mind-drop-prototype.html`: the card tokens in its CSS, the timings in its `T` table, and every moment's flow in its script.
2. `CLAUDE.md`, `docs/minddrop-classify-v3.md`, `docs/minddrop-relate.md`, `docs/2026-09-29-minddrop-model-audit.md`, and the filing chip section of `docs/worlds/HANDOFF.md` (lines 200 to 256).
3. `Claude outputs/already-have-it-replay.html`, the Luna against Gemini replay behind stage 1.

**Other work this touches**

- **Data fabric** (`data-fabric-revamp-10.6`): owns filing (`workers/inngest-jobs/context/filing.js` and the new `assign-worlds` reply with `filed: {by, world, chapter}`). Merged to main on 9 October. It also moved the drop prompts into `workers/cortex/minddropPrompts.js` and added `scripts/minddrop-prompt-replay`, which stage 2 builds on. This build only reads the filing reply (stage 9) and changes nothing in filing.
- **Worlds build** (`docs/worlds/HANDOFF.md`): its filing chip on the drop card is built here as the where it lives part of the meta line, with tap to fix through `components/overlay/WorldsChapterPicker.tsx`. James's yes on this prototype is the mock that handoff asked for. Note it in that handoff so it is not built twice.
- **Celebrations** (on main): the fed moment fires from the store when the gauge fills. Keep `celebrate()` and the gauge preview in the submit path (`app/screens/CatchAllNotepad.tsx` 2841 to 2893) as they are.
- **Onboarding rework** (prototype only): its drop cards should reuse the new `DropCard` when it is built.
- **Wrap up and the morning quick sweep** (on main): stage 8 changes which cards they get. `lib/sweep/quickSweep.ts` and `workers/inngest-jobs/notifications/sweepCount.js` must stay in step; their headers say so.

**Baselines**

- A full jest run on main, with the failures that already exist listed in the handoff note.
- The classifier's locked 1,000 drop set on today's prompt, v3.7. Its data is gitignored and not in the main checkout, so first copy `scripts/minddrop-audit/data/` and `scripts/minddrop-audit/round2/data/` from `.claude/worktrees/gate-base/scripts/minddrop-audit/` (the same files in every worktree). Then, with the keys below:

```bash
cd scripts/minddrop-audit && mkdir -p results round2/results
export GEMINI_API_KEY="$(grep '^GEMINI_TEST_API_KEY=' ../../.audit-keys.local | cut -d= -f2-)"
NODE_USE_ENV_PROXY=1 node --import ./loader.mjs run-v3-worker.mjs test2 base37 CLASSIFY_PROMPT=v3.7 CLASSIFY_PROVIDER=gemini CLASSIFY_MODEL=gemini-3.8-flash CLASSIFY_THINKING_LEVEL=low CLASSIFY_FALLBACK_PROVIDER=openai CLASSIFY_FALLBACK_MODEL=gpt-6-luna
cd round2 && node test-report.mjs
```

- The relate replay already exists: `scripts/relate-replay/run.sh --variant <gemini|luna-low|luna-none> --run <n>` (628 real drops, data and results gitignored).
- A timing baseline from `ai_usage` for the last 60 drops (jobs `classify-v3/reply`, `minddrop-relate/entity_match`, `enrich-phase1-5a`, `enrich-phase2`, `assign-worlds`), so stage 12 can compare like with like.

**Keys and network:** `.audit-keys.local` holds `OPENAI_API_KEY`, `GEMINI_TEST_API_KEY` and `ANTHROPIC_API_KEY`. The audit harness reads `GEMINI_API_KEY`, hence the export above. In the Cowork VM, node's fetch needs `NODE_USE_ENV_PROXY=1`.

## Stage 1: the already have it check on Luna

Move `minddrop-relate` to GPT-6 Luna at low reasoning under its own model setting, so chat's matcher stays on Gemini. Size: small. Ships alone and helps the app builds already out. Its first commit also adds `scripts/relate-replay/` (its own `.gitignore` keeps the data out) and the two `docs/2026-10-minddrop-rethink` files, which are untracked on main.

**Why its own setting.** The check calls `helperFetch('entity_match', ...)` (`workers/cortex/minddropRelate.js` 367 to 380), and `entity_match` resolves to `MODEL_ENTITY_MATCH` (`workers/cortex/models.js` 73, `wrangler.toml` 150). Three chat callers share that job in `workers/cortex/entityMatch.js` (`matchEntity` 824, `offerLateCard` 910, `checkNewAgainstTracked` 949), so changing the shared var would move chat too.

**Build**

1. `workers/cortex/models.js`: add `drop_relate: 'MODEL_DROP_RELATE'` to `HELPER_JOB_VARS`. With no var set it falls back to the shared helper model (`HELPER_MODEL`, gpt-6-luna in `wrangler.toml` 113).
2. `workers/cortex/minddropRelate.js`: call `helperFetch('drop_relate', { ...body, reasoning_effort: 'low' })`. `helperClient.js` (84 to 94) passes `reasoning_effort` to OpenAI reasoning models and drops it for Gemini, so a rollback to Gemini needs no code change.
3. `workers/cortex/wrangler.toml`: add `MODEL_DROP_RELATE = "gpt-6-luna"` beside `MODEL_ENTITY_MATCH`, with a comment that chat's matcher stays on Gemini, and update the comment at 31 to 33, which still describes one shared matcher model. Its fallback becomes `HELPER_FALLBACK_MODEL` (gemini-3.8-flash), inside the same 6s abort.
4. Optional, gated: in `buildRelateInput`, put the item list before the drop (today, then the items, then `DROP:` last), so Luna can reuse the cached list between drops. Ship it only if the replay below shows no change in answers.

**Tests**

- `workers/cortex/__tests__/minddropRelate.test.js`: a test that `relateDrop` sends job `drop_relate` with `reasoning_effort: 'low'`, stubbing fetch the way `helperClient.test.js` 58 to 79 does. If step 4 ships, a test that the drop line comes after the last item line.
- `models.test.js` already checks that every helper job defaults to the helper model.

**Gate (James)**

- The model choice is already replayed: 628 real drops, two runs each, in `Claude outputs/already-have-it-replay.html`. James chose Luna low.
- Step 4 only: run `scripts/relate-replay/run.sh --variant luna-low --run 3` and `--run 4` on the new order, then compare with runs 1 and 2 on the 66 drops listed in the replay page. Ship it if right, missed and wrong stay within the run to run spread (right 18 to 20, missed 6 to 8, wrong 0 to 2).

**Done when**

- `ai_usage` shows `minddrop-relate/drop_relate` on `gpt-6-luna`, and chat's `entity_match` jobs still on `gemini-3.8-flash`.
- A live drop that reports a finished todo still gets its question.

**Rollback:** set `MODEL_DROP_RELATE = "gemini-3.8-flash"` and redeploy the worker.

## Stage 2: the title and reaction call, without the kind

The `enrich-phase1-5a` route learns to work before the classifier has answered, writes sentence case titles that leave out what has its own place on the card, stops writing the card note, and Gremly's reaction stops asking questions. Size: medium. It is a prompt change, so it waits on a replay James reads.

**Today** (after the data fabric merge): the prompt is `titleReactionPrompt` in `workers/cortex/minddropPrompts.js` (with `titleReactionUser` for the user turn and `MINDDROP_PROMPTS_VERSION`), built from `TITLE_RULES`, `CARD_NOTE_RULES` and `REACTION_RULES`; the reclassify prompt shares the title and reaction rules. It is already semantic rules only, the old banned phrase lists are gone, and `TITLE_RULES` already leaves out when it happens, how often and how they feel. What still needs to change:

- The prompt says what kind of item it is has already been decided, and `titleReactionUser` always sends `BUCKET` and `SUBTYPE`; the route itself turns a missing bucket into log (`body.bucket || 'log'`, 9744), so no bucket never reaches the prompt.
- `TITLE_RULES` asks for Title case, and the route (`cortex-index.js` from 9739) then runs `titleCase` (3598), which lowercases every letter after the first, so FY26 becomes Fy26. It does this for this route (9782, 9799) and for reclassify (9069, 9154).
- A title shorter than 3 or longer than 60 characters is replaced by the drop's first 50 characters, cut mid word (about 9796).
- `REACTION_RULES` lets the reaction be a question, and the variety rule asks it to move between questions, statements and exclamations.
- After the model, code strips a trailing filler word and an opening Ooh or Oh from the reaction and swaps dashes for commas (about 9820 to 9840), and the card note is still written.

Real titles from the last month show the cost: Coaching Korfball This Evening; Do Long Run Tomorrow Instead; Send Sage Fy26 Wrap-up to Leadership; Work Out Regularly. Cycle And/or Run, and Do Stren.

**Build**

1. **Prompt** (`minddropPrompts.js`), semantic rules only:
   - When a kind is given, use it. When none is given, work out what kind of thing the drop is from its words and apply the matching title and reaction rules. Drop the already decided line; `titleReactionUser` leaves out the `BUCKET` and `SUBTYPE` lines when none is sent.
   - **The title**, as James locked it: the thing itself, in the user's own words. Keep the rules that leave out when it happens, how often and how they feel, and add how long it takes; each has its own place on the card and can change. Otherwise keep their words, and rewrite only when the drop is long, rambling or messy. Sentence case: capitalise the first word and keep every other word exactly as written, so names, acronyms and brands keep their capitals. This replaces the Title case line in `TITLE_RULES`, so reclassify gets it too.
   - Remove `CARD_NOTE_RULES`, the card note section and `card_note` from the output.
   - **The reaction** never asks the user anything or invites a reply, so no one mistakes Mind Drop for a chat and answers in their next drop. Remove the question from the first rule and from the variety rule (vary openings and endings across statements and exclamations). Keep never saying back what the title says, and add never saying what kind of item it became. No dashes.
   - Bump `MINDDROP_PROMPTS_VERSION`.
2. **Code** in `cortex-index.js`:
   - Use the existing `sentenceCase` helper (3631: first character upper case, nothing lowered) in place of `titleCase` at 9069, 9154, 9782 and 9799. `titleCase`'s remaining callers are dead code, removed in stage 11.
   - A failed or out of range title falls back to the drop's own words through `sentenceCase`, cut at a whole word near 60 characters, never mid word.
   - Remove the filler word and Ooh or Oh strips from the reaction: the prompt already covers both, and the replay counts them. Keep the dash swap as a backstop, with a `console.warn` naming the route whenever it fires, so it never hides a prompt problem.
   - Remove the `'log'` default for a missing bucket (9744), so no bucket reaches `titleReactionUser`; builds already out always send one. The route also adds a fixed opener (Got it., It's on my list. and the like) at the start or end of the reaction at random (`OPENERS` and `poolKey`, about 9860 to 9925). The prototype's bubble lines have none, and the prompt says never speak of the drop as kept or on a list, so the opener goes; the replay page shows reactions with and without it so James confirms at the gate. The cut at 67 characters plus an ellipsis (about 9843 and 9922) stays as a backstop, logged with a `console.warn` like the dash swap.
   - `card_note` stays out of the reply; builds already out show no second line when it is missing.

**The replay (the gate)**

`scripts/minddrop-prompt-replay` came with the merge: `run.sh title --old <module>` calls the title prompt exactly as the Worker does, beside the prompt it replaced, on made up items, with Sonnet judging the writing against the prompt's rules. Extend it rather than build a new script. In the Cowork VM it cannot run through `run.sh`, which bundles with a macOS esbuild; from the repo root run `set -a; . ./.audit-keys.local; set +a; NODE_USE_ENV_PROXY=1 node --no-warnings --import ./scripts/minddrop-audit/loader.mjs scripts/minddrop-prompt-replay/run.mjs title --old <absolute path>`, where the old module is a copy of today's `minddropPrompts.js` saved under `scripts/minddrop-prompt-replay/old/` before any edit. Run the `reclassify` part too, since it shares the title and reaction rules. Add:

- A `--real` mode reading about 300 recent drops from James's account (`05a3c53d-b242-4b5f-a0db-83004c8e3892`) and the main beta tester's (`c64ec85f-735c-4d5c-859a-1ac6630aebb3`, the T account in `scripts/relate-replay`), in a gitignored `real/` folder, exported with the Supabase MCP (large results land in a file, so check the md5 of the export). Old prompts get the bucket; new prompts get none.
- The details call runs on each drop too, so the report can check that every when, how often or how long left out of a title was caught by the details. Every miss is listed for James.
- Counted checks: no dashes; reaction at most 70 characters; every reaction that asks the user something, listed; titles that rewrote a short drop; capitals from the drop kept in the title; how often the dash backstop would have fired.
- One page, `Claude outputs/words-replay.html`: each drop with its old and new title and reaction, the counts on top.

**Gate (James):** he reads the page and says yes. No code check decides tone.

**Tests:** a new `workers/cortex/__tests__/minddropPrompts.test.js` that fails on any dash, example words, `card_note` or a reaction rule that invites a question; `sentenceCase`, moved with the fallback cut out of the request handler into a new exported `workers/cortex/titles.js` so it can be tested (`workers/cortex/__tests__/titles.test.js`), keeps LLMO SFDC, FY26 and UK; the fallback never cuts mid word; no bucket means no `BUCKET` line.

**Rollback:** redeploy the previous Worker; the app copes with either reply.

## Stage 3: classifier v3.8, clear or unsure splits and pieces that can ask

A new prompt version, v3.8, adds one field to multi drops (is the split clear or unsure) and lets a piece be unclear with its own question. Size: medium. It changes the audited classifier, so the locked 1,000 drop set decides whether it ships.

**Today** (`workers/cortex/classifyV3.js`): `PROMPT_VERSION = 'v3.7'` (40 to 41). Principle 9 (523) defines multi drops. The output line (537 to 538) says a segment's outcome is "any outcome except ambiguous", and `normSegment` (782 to 797) turns any ambiguous piece into `log/general`. There is no notion of how sure a split is.

**Build**

1. Add `v3.8` at the front of `PROMPT_VERSIONS` (the test at 98 needs `PROMPT_VERSION` to equal the first). `v3.7` stays selectable with `CLASSIFY_PROMPT`, and its text must stay exactly as it is today: `buildClassifyV3Prompt` (576) returns the base prompt for the default version and builds v4.1 and v4 on top of it, so copy today's base into its own frozen builder, hash today's v3.7 text before any edit and test that `CLASSIFY_PROMPT=v3.7` still gives it, and keep v4.1 and v4 built on the frozen v3.7. Add `CLASSIFY_PROMPT = "v3.7"` and `CLASSIFY_SPLIT_AUTO = "true"` to `wrangler.toml` in this stage, so no deploy runs v3.8 before James switches it. Log the version that actually ran (`classifyV3.js` about 860 logs the constant).
2. Principle 9 gains, in semantic words: a split is clear when the user plainly listed separate things that each stand on their own as an entry; it is unsure when the pieces could as reasonably be one item with its details, or one job. Output field `split`, `"clear"` or `"unsure"`, only when `is_multi`.
3. A segment may be ambiguous, with `ambiguity_type`, `question` and `option_labels` under the same rules as a whole drop. The Sonnet question writer does not run for pieces, to stay inside the 9s budget; the classifier's own words pass through `buildClarification` (671) and fall back to the fixed copy for that kind.
4. Compatibility: new app builds send `piece_questions: true`. Without it, the route keeps turning ambiguous pieces into `log/general`, so builds already out behave as today.
5. The route returns `split` and each piece's question fields alongside the existing ones. For a multi drop the normaliser (about 896 to 906) sets `bucket` to the first piece's kind and `dominant_bucket` to the most common piece kind, and throws away the model's own top level outcome. Keep that outcome as `as_one` (bucket, subtype, habit subtype), so an unsure split is saved as the AI's choice (stages 4 and 7); if it is missing or ambiguous, use the first piece's kind and log it.

**Tests:** update `workers/cortex/__tests__/classifyV3.test.js`: the version test (98), the multi shape (465), the ambiguous piece (379 to 397) with and without the flag, and a new case for `split`. The prompt rule tests (27 to 63: no dashes, no examples, no word lists, static) must pass for v3.8 unchanged.

**Gate (James)**

1. Tune only on the design set (`dev` and `holdout`, 450 drops) through `run-v3-worker.mjs`. Multi pieces are scored against `round2/data/design_gold.json` by running `score2.mjs`'s `scoreRows2` over the worker rows. Freeze the prompt and record its hash in `round2/FREEZE.txt`.
2. Teach `run-v3-worker.mjs` to send `piece_questions: true` and to record `split` and `as_one`. Run the locked set once, `test2` with `CLASSIFY_PROMPT=v3.8` and tag `v38`, then `round2/test-report.mjs` against the `base37` baseline from Before you start (`node test-report.mjs "Worker: base37" "Worker: v38"`).
3. Ship only if accuracy is not lower than v3.7 beyond run to run noise (list and read every drop whose answer changed), silent mistakes and needless questions are not higher, multi drops found stay at 34 of 35 or better, and pieces right at 74 of 76 or better.
4. New in the report: for each of the 35 gold multi drops, clear or unsure; and for every single drop the model split, whether it said unsure. A wrong split marked clear is a silent mistake; marked unsure, it becomes a question. James reads the clear list. The fallback is a Worker setting, `CLASSIFY_SPLIT_AUTO` (default "true"): when "false", the route returns `split: 'unsure'` for every multi drop, so each one asks on its card. If James finds a wrong split in the clear list, v3.8 ships with it "false", tuning carries on with the design set, and it goes back to "true" once the clear list is clean (decided 9 October).

**Deploy:** set `CLASSIFY_PROMPT = "v3.8"` in `wrangler.toml`. **Rollback:** set it back to `"v3.7"`.

## Stage 4: the pipeline reorder

The queue runner starts every call the moment it can start, saves the drop as its kind as soon as it is sorted, and adds the details to the saved row when they arrive. Size: large, and the riskiest stage: a second model reads the diff before James tests. Stages 4 to 8 ship as one app build; James tests in the simulator after stage 6 and again after stage 8.

**Today** (`lib/minddrop/`): phases `queued → classified → titled → enriched → complete` (`dropQueue.ts` 156 to 165). `handleClassified` (`dropPhases.ts` 449 to 552) only then starts the title call, waits up to 6s for it, then for the relation (up to 7s). `handleTitled` (644 to 705) only then starts Phase 2. The single insert is in `handleEnriched` (707 to 775, `dropSync.ts` 305). Filing runs after complete (`dropPipeline.ts` 82).

**The new order**

1. **Queued (the tap).** `handleQueued` starts three calls at once: the relation check (`startDropRelation`, as now), the title and reaction call without a kind (new `startDropWords`, kept in a memory map the same way relations are), and `classify-v3` with `piece_questions: true` and `write_question: false`. It now sends `timezone` and `currentDate` to the title call, and copies `reminder_intent` onto the drop (today it is set in `phase1.ts` 386 and never copied, so Phase 2b and `scheduleAutoReminderForDrop` never run).
2. **Sorted (about 2.0s).** The kind is known. Start Phase 2 at once with the bucket (new `startDropDetails`). If the drop is unclear, start `fetchClarification` (the `clarify-ambiguity` route, which already uses the Sonnet writer). Wait for the title call for at most 1s more. Emit `drop:reaction_ready` when both the kind and the words are in, so the bubble and the card change together.
3. **Saved (about 2.3s).** Insert the drop as its kind straight away, without waiting for details or the relation: a todo, habit, note, event or journal. An unclear drop is a note carrying its question, as today. A clear split inserts each piece as its own item with `views.split_group = {id, index, count, text}`. An unsure split inserts one item of the classifier's `as_one` kind (stage 3) with `views.split = {status: 'pending', pieces: [...]}`. The 23505 duplicate path (`dropSync.ts` 310 to 320) keeps a retried insert safe. `drop_id` is unique per owner on todos, habits and notes, archived rows included, so each piece gets `split-<localId>-<index>` (today's split convention) and Keep as one's note gets `kept-<localId>`; never reuse one. The list key and the pending filter (RecentDrops about 2900 to 2910) must match pieces to their parent's queue item.
4. **Relation, whenever it lands.** Attach it to the saved item of any kind with an update to `views.relation`, plus `surface: 'card'` when it arrived before the card settled, or `surface: 'sweep'` after. Nothing is held as a note any more; stage 6 builds the answers on this shape.
5. **Settled (about 4.0s).** When Phase 2 returns, one update writes its fields to the saved row (new `updateDropDetails` in `dropSync.ts`, the same columns the insert writes today) and sets `views.minddrop_stage = 'settled'`. If Phase 2 has not answered 5s after the sort, the card settles without details and the details are written when they come.
6. **Complete.** Dequeue once settled (and, from stage 9, once filing has replied).

**Worker addition:** `classify-v3` honours `write_question: false` by skipping the question writer (about 8830 to 8890), so the kind is not held up by Sonnet. Builds already out never send it.

**Keep working:** offline drops wait in the queue and show as landed (`isReadyForProcessing`, `dropPipeline.ts` 325 to 347); a drop persisted by the old build resumes (`migrateDropPhases`: `classified` and `titled` become `sorted`, `enriched` and `syncing` become `saved`, the insert being safe to retry by `drop_id`; `multi_detected` and `multi_awaiting` become `sorted`); retries and the failed row stay as they are; the card keeps the drop id as its list key so the saved row replaces the queue item without a flicker (RecentDrops 2907 to 2910); `syncQueueToZustand` (54 to 119) re-renders on the new fields.

**Measure:** one `app_events` row per drop with the milliseconds to sorted, saved and settled, and no words, so stage 12 can compare with the baseline.

**Tests:** rewrite `lib/minddrop/__tests__/dropPhases.test.ts` and `dropPhases.relation.test.ts` around the new order: the title call and the relation start at the tap; details start at the sort; the insert never waits for details or the relation; a relation after the settle is marked for Sweep; old phases migrate; `reminderIntent` and `timezone` are sent. Extend `dropSync.test.ts` (`updateDropDetails`, pieces, unsure split) and `dropPipeline.test.ts` (new phases, resume after a kill).

## Stage 5: the new drop card, look A

A new `DropCard` draws look A from the prototype and replaces the body of the drop card in Recent drops. The card's states follow the fields stage 4 writes, never timers. Size: large in lines, low in risk, because it only changes drawing.

**Today** (`app/screens/RecentDrops.tsx`): `AnimatedMindDropCard` (1819 to 2495) switches between `EnrichingSkeleton` (1464), `PendingSkeleton` (1341) and `RevealingCard` (1597) while a drop is in flight (2141 to 2184), then shows the settled card with `Row3Chips` (989). The second line comes from `sessionCardNotes` (300), a Map held in memory and never saved, so it vanishes on a restart. `UnifiedCardWrapper` (492, used at 4836) owns the enter (scale from .65, fade from .2), the leave glide and the reorder.

**Build**

1. New `components/minddrop/DropCard.tsx`, beside the existing Mind Drop components, with parts `KindTile`, `DropTitle` and `MetaLine`, and slots for `AskStrip` and `DupeLine` (stage 6) and `SplitBar` (stage 7). Reanimated for every motion. `AnimatedMindDropCard` renders `DropCard` inside the same `UnifiedCardWrapper`, so the enter, leave and reorder animations stay exactly as they are.
2. **Landed** (queued, not yet sorted): the user's words are the title, in `#3A4A42`. The tile is linen 2 (`#F1EDE5`) with an 8px moss dot that breathes (scale .7 to 1.15, opacity .35 to .75, 1.1s loop). The meta line holds three 4px sage dots that bob in turn (1.2s, .15s apart). Nothing else: no italics, shimmer, Organizing line or breathing border.
3. **Sorted:** the tile fills to the kind wash (.45s) and pops (scale .86, 1.07, 1 over .5s); the kind icon scales in from .6 and draws its stroke in over .6s; the raw words fade out as the new title fades in (about .35s); the wait dots give way to the kind word. When the new title differs from the raw words only by the first capital, there is no crossfade. One known gap: the prototype also blurs the outgoing words by 4px, and React Native cannot blur text on iOS, so the crossfade uses opacity alone rather than adding a library. The builder notes this in the handoff.
4. **Settled:** the later parts of the meta line fade in and rise 3px into place (.35s), the card gives one small breath (scale 1.012 over .42s), and on the newest card the existing Talk it through with Gremly row fades in. Then nothing moves.
5. **Tokens**, from the prototype's look A: white card, radius 16, padding 12 top, 14 right, 12 bottom and 12 left, a 12 gap between tile and text, a 1px border at `rgba(46,85,64,.08)` and a soft shadow (`#1A3328`, opacity about .08, radius 7, offset 3; elevation 2 on Android). Tile 38 square, radius 12, icon 19 with stroke 2. Title `PlusJakartaSans-SemiBold` 15.5 on 21 in `#1A3328`, wrapping rather than cut to one line. Meta `Inter-Regular` 13 on 19 in `#5C6660`, gaps of 10, icons 13 with stroke 2.2, the kind word in `Inter-SemiBold` in the kind's ink.
6. **Kinds:** Todo `#EAF2E8` and `#2E5540` with `CircleCheck`; Habit `#ECEEFA` and `#454A86` with `Repeat`; Event `#F8EDE4` and `#9A6232` with `Calendar`; Journal `#F3E8EF` and `#7A4467` with `NotebookPen`; Idea `#F6EDD2` and `#6E5413` with `Lightbulb`; Note `#EFEDE6` and `#55605A` with `StickyNote`; an unclear drop is One quick question, `#EEF4EC` and `#2E5540` with `MessageCircleQuestionMark` (its name in lucide 0.545). Notes map by subtype: event, journal and idea to their own kinds; general and catchall to Note.
7. **The meta line**, in order: the kind word; when (the due day, or the event's day and time, through DateService, for example Today, Due Fri, or Fri, 7:30pm; No date yet for a todo without a day); how long (the estimate, as 5 min, About 45 min or About 2 hrs); how often for a habit; the mood for a journal; and where it lives (stage 9, with `Compass`). Each part uses the icon the prototype gives it. It wraps to a second line rather than truncate. People and tags no longer show on the card; they stay on the item's own screen (decided 9 October).
8. **Stop rendering**, in the drop card only: the three skeletons, the type badge, the relative time, `Row3Chips`, the italic pending title, the Organizing line, and `sessionCardNotes` with its writes (2885 to 2890). The components themselves are deleted in stage 11, after the impact audit (`Row3Chips` has its own test file).
9. **Accessibility:** nothing below 12 points; one accessibility label per card that reads the kind, the title and the meta line; with reduced motion on (reanimated's `useReducedMotion`), every change is instant; every button at least 32 high.

**Tests:** a new `components/minddrop/__tests__/DropCard.test.tsx` that renders each state (landed, sorted, settled, question) for each kind and checks the title, the kind word, the meta parts and their order, that no second line appears, and that reduced motion still reaches the final state. `RecentDrops.row3chips.test.tsx` is retired or rewritten in stage 11.

**Gate (James):** stages 4 to 6 go to the simulator together; see stage 6.

**Done when:** a drop lands, sorts and settles in the simulator and matches the prototype side by side, in every kind, on a small phone and a large one.

## Stage 6: one way to ask, Not now, and the quiet duplicate line

Every question about a drop sits on its card as a strip with one tap answers, Not now means one thing everywhere, and Same as this one? becomes a quiet line. The rules live in one module that the card, Sweep and the worker's count all follow. Size: large. After this stage James tests stages 4 to 6 in the simulator.

**Today:** tapping a card with a question opens a popup from the overlay (`openRelationPopup` and `openClarificationPopup`, RecentDrops 2212 to 2240; drawn by `components/minddrop/ClarificationPopup.tsx` and `RelationPopup.tsx` in `contexts/OverlayContext.tsx` (719 and 731), which RecentDrops reaches through `useGlobalOverlay` (4861)). Skip there calls `resolveSkippedClarification` (`lib/store/useGremlyStore.ts` 8865 to about 9095), which marks the question resolved and skipped, so Sweep never asks again; its failure path (around 9032) always writes to a note, even when the item is a todo or habit. A related drop is held as a note until answered (`lib/minddrop/dropRelation.ts`, `relationActions.ts`), and `applyDropRelation` (415) and `keepDropAsNew` (538) assume a note throughout.

**The ask rules** (new `lib/minddrop/asks.ts`)

- Four kinds of ask: clarify (an unclear drop: `needs_clarification` and not resolved); split (an unsure split, `views.split.status` pending, stage 7); relation (done, log, change, add, remove, or which one: `views.relation.status` pending); and same, which is never a question on the card.
- Every ask records `views.ask_since`, the day it was made (DateService), and `views.ask_on_card`, true when it reached the card by the settle: always for clarify and split, and for a relation when stage 4 marked it `surface: 'card'`.
- One strip at a time on a card. If a second ask comes due, the one showing stays and the other follows its answer. An ask that arrives after the settle never appears on the card.
- **Not now** on the card: the strip closes and the item stays exactly as saved (an unclear drop stays a note, an unsure split stays one item, a related drop stays its own item). `ask_on_card` becomes false and the meta line shows Kept as it is and Sweep will ask again (`StickyNote`, `Moon`). Nothing is marked resolved or skipped.
- **In Sweep** (stage 8): the evening wrap up shows live asks made that day; the morning quick sweep shows live asks made that day or the day before. Moving past a question in Sweep without answering it lets it go.
- **Lapse:** an ask lapses when it is passed in Sweep, or once the day after `ask_since` is over. Lapsing writes the plain outcome: clarify becomes resolved with `clarification_lapsed: true`; split becomes kept as one; relation and same become `status: 'lapsed'`, and both items stay. `isAskLive(item, today)` checks the day, so no timer is needed; the store writes any lapsed asks when it next loads, so nothing old comes back.
- Helpers: `askOf(item)`, `isAskLive(item, today)`, `sweepShowsAsk(item, today, 'wrapup' | 'quick')`, `notNow(id)`, `lapseAsk(id)` and `answerAsk(id, answer)`. `sweepCardAsks` (`lib/sweep/sweepOrder.ts` 25) delegates to them.

**Build**

1. `components/minddrop/AskStrip.tsx`, from the prototype: it opens under the card body with a height reveal (.45s) and a hairline top border; Gremly's 24px face beside the question in `PlusJakartaSans-Bold` 14.5 on 20 in `#1A3328`; optional extra rows (the pieces, or a mini row of an item); answers as buttons at least 38 high, radius 12, sage wash `#EAF2E8` with moss text in `PlusJakartaSans-Bold` 13.5 and an optional 15px icon, rising in 50ms apart; a foot with a 12px hint and Not now. On a tap the chosen button fills moss, the others fade to .25, the action runs after .26s and the strip closes.
2. **Clarify:** the words come from `clarify-ambiguity`, started at the sort by stage 4. Answers run through the handler the overlay uses today (`handleClarificationSelect` in `contexts/OverlayContext.tsx` (345), which turns a `freetext:` answer into `isFreeText` and calls `resolveEntityClarification`), moved into `answerAsk` so the card and Sweep share it. A date answer that needs a day opens a second strip, When is it?, with three day buttons and Not now, as in the prototype's dentist moment. Every clarify strip, on the card and in Sweep, ends with a Something else button that opens a one line field with Go. What they type goes through `resolveEntityClarification` with `isFreeText` true (store 7824), exactly as the popup's free text does today, so a weak question never leaves anyone stuck (decided 9 October).
3. **Relation:** words from `relationQuestion` and `relationButtons` (`dropRelation.ts` 212 to 271), with a mini row of the item it means (kind tile, title, and for a habit its week dots, as in the prototype's run moment). Answers through `applyDropRelation`, which now finds the drop among todos, habits and notes (`heldNote` becomes `heldItem`; `ENTITY_TYPES` already lists all three). A new drop is already saved as its kind, so for it `keepDropAsNew` only marks the relation kept. Its note to kind conversion stays for drops an older build held as notes (none in the database today, but builds already out can still make them), and a lapse of one of those goes through it. A which one relation (`kind: 'choose'`) shows its candidates as buttons. After an answer: the existing toast with Undo (`RelationToast.tsx`), restyled as the prototype's (forest, linen text, radius 16), and the outcome line in the bubble from `outcomeWords` (`relationActions.ts` 307), with no new AI call.
4. **The quiet duplicate line** (`DupeLine`): when a same relation reaches the card by the settle, a line opens under the meta line on linen, radius 11, 12.5 on 17 in muted: `ListChecks` 14 in `#4B6A50`, You already have this, then the existing item's state in SemiBold (due today, due Fri, every morning), and a Keep just one button (white, 1px `rgba(46,85,64,.2)` border, radius 9, at least 32 high, `PlusJakartaSans-Bold` 12.5 in moss). Nothing is asked and the drop has already filed as normal; `ask_since` is set so the wrap up can ask if it is left. A same relation that arrives after the settle skips the line and goes to the wrap up.
5. **Keep just one:** `applyDropRelation` for same keeps anything new the drop said on the item you had and archives the drop. When the matching card is on screen, the drop's card glides into it (moves to it, scale .92, fades, .52s) and that card pulses once with a 4px ring; otherwise it leaves with the usual glide. The toast says Kept one, the drop is archived, with Undo, which restores the drop and takes the added words back off.
6. **Undo restores everything, reminders included.** `restoreTodo` (3383), `uncompleteTodo` (3316) and `restoreHabit` (4048) do not put back reminders today. Fix them in the store with tests, because every relation answer's Undo relies on them.
7. **No popups from Mind Drop:** remove the popup calls from the card (RecentDrops 2212 to 2240); tapping a card opens the item, as for any card. Mind Drop no longer calls `resolveSkippedClarification`; if nothing else does after stage 8, it is removed in stage 11, otherwise its write at about 9032 is fixed to use the item's own kind.

**Tests:** `lib/minddrop/__tests__/asks.test.ts` for every rule above: one strip at a time; a late relation never reaches the card; Not now keeps the item as saved and the ask live; the wrap up shows only asks made that day; the quick sweep shows that day and the day before; passing in Sweep lapses; the day after next lapses; the lapse outcome for each kind of ask. Render tests for `AskStrip` and `DupeLine`. Extend the relation action tests to drops saved as a todo, a habit and an event, and add store tests that Undo brings reminders back.

**Gate (James):** a simulator build with stages 4 to 6. Play each prototype moment beside the prototype (A simple drop, Unclear drop, Already have it, Already on your list, A feeling), then airplane mode, killing the app mid drop, and a drop that reports a finished todo.

**Done when:** no popup opens from Mind Drop, every card question matches the prototype, and Not now always reads Kept as it is.

## Stage 7: splits that unzip, Keep as one, and unsure splits

A clear multi drop becomes its pieces the moment it is sorted, with Keep as one right under them; an unsure one asks on its card with the pieces shown; an unclear piece asks its own question. Size: medium, on top of stages 3, 4 and 6.

**Today:** the multi path in `dropPhases.ts` (about 555 to 640) runs the title call on each segment, then saves one note with `multi_items`. The user splits through `MultiSplitModal` (`app/components/minddrop/MultiSplitModal.tsx`, rendered at RecentDrops 4875; handlers `handleKeepAsNote` 4118 and `handleSplitSelected` 4506) or Sweep's split step (`SweepMultiSplitStep`, CardDeckScreen 1450 to 1485 and 1894, whose handler at about 1594 creates a bare todo with no details). The bubble gets a fixed line, Tap the card and I can split or keep as one, and no reaction. The whole drop's relation answer is thrown away (`forgetDropRelation`, about 386).

**Build**

1. **Clear split** (`split: 'clear'`): at the sort the landed card unzips. Stage 4 has already inserted each piece as its own item with `views.split_group = {id, index, count, text}`. Each piece's card is sorted at once with its own kind and starts with the piece's words in sentence case (an app helper with the same rule as the Worker's `sentenceCase`), which under the new title rule is nearly always the final title. The title call runs for each piece with its kind and only rewrites a long or messy piece (its reaction is not shown), and the details call runs for each piece; each card settles on its own. Motion, from the prototype: the pieces rise out of the parent's place (scale .94 to 1, .52s, 90ms apart, a slight overshoot) while the parent goes.
2. **The split bar** (`SplitBar`), under the last piece: `Split` 14 and Split into 3 on the left in 12.5 muted, and a Keep as one pill with `Undo2` on the right (white, 1px `rgba(46,85,64,.2)` border, at least 32 high, `PlusJakartaSans-Bold` 12.5 in moss). It shows while the pieces are the newest cards on screen; Keep as one is also on each piece in Sweep (stage 8).
3. **Keep as one:** one note with the drop's words, titled by the title call that ran at the tap, settled with Kept as one note in the meta line; the pieces are archived with `archived_reason: 'kept_as_one'` and fold into it (a short scale and fade). Gremly says One note it is.
4. **Unsure split** (`split: 'unsure'`): saved as one item of the classifier's top level outcome (it gives one for every drop) with `views.split = {status: 'pending', pieces: [{text, kind}]}`. The card sorts as that kind and the strip asks with the prototype's words: One job or two? (the number follows the pieces), the pieces listed with their kind tiles, Split into two and Keep as one, the hint Keep as one is the safe choice, and Not now. Split unzips exactly as a clear split and archives the one item with `archived_reason: 'split'`; Keep as one sets `views.split.status = 'kept'` and settles the card; Not now follows stage 6.
5. **An unclear piece:** with stage 3's piece questions, a piece the classifier could not settle becomes a One quick question card, saved as a note carrying its question exactly like a whole unclear drop, with its own strip. Several unclear pieces each get their own strip, one per card.
6. **The relation for split drops:** the whole drop's answer is kept as a filter. When it found nothing, as for most drops, the pieces are not checked. When it found something, the relate check runs on each piece in parallel (Luna, about 2.2s) and the answers attach to the pieces under the rules of stages 4 and 6. Multi drops are about 3.5 in 100, so the cost is tiny.
7. **Leaves Mind Drop:** `MultiSplitModal` and its two handlers, the fixed multi line, and new writes of `multi_items`. Older notes still holding unresolved `multi_items` are read by `askOf` as unsure splits made on their own day, so they lapse straight away and stay as one note, as they look today.

**Tests:** in `dropPhases.test.ts`, a clear split inserts every piece with its `split_group`; an unsure split inserts one item with `views.split`; an unclear piece carries its question; pieces are checked for a relation only when the whole drop found one. Render tests for `SplitBar`, and store tests that Keep as one leaves one note and the pieces archived, and that Split archives the one item.

**Gate (James):** stage 3's locked set decides how good clear and unsure are. In the simulator, the clear split and unsure split moments beside the prototype.

**Done when:** no split modal is left in Mind Drop, and a clear split's pieces each settle with their own details.

## Stage 8: Sweep and the morning quick sweep

Sweep asks with the same strip and follows stage 6's rules, the split step goes, Same as this one? becomes a wrap up card, and the worker's morning count follows the same rules. Size: medium. James tests stages 7 and 8 in the simulator together.

**Today:** Sweep (`app/screens/CardDeckScreen.tsx`) asks through the same popups (`ClarificationPopup` 1313, `RelationPopup` 1325); its Skip (1020 to 1023) only closes the popup; its relation code assumes a note (about 1028 to 1065). `sweepCandidatesAsOf` (`lib/store/selectors.ts` 766 to about 950) always includes held notes (about 822 to 870). `sweepCardAsks` (`lib/sweep/sweepOrder.ts` 25) knows relations on notes only and gives a question no time limit. The quick sweep (`lib/sweep/quickSweep.ts`) keeps any card with a question, and the worker mirrors it (`quickSweepItems`, `workers/inngest-jobs/notifications/sweepCount.js` 112, used at 183 for the morning count).

**Build**

1. **Which cards:** `sweepCandidatesAsOf` includes any todo, habit or note whose ask `sweepShowsAsk(item, today, 'wrapup')` accepts, whatever its kind or day. `needsDecision` (`quickSweep.ts` 23) uses `sweepShowsAsk(item, today, 'quick')`. Questions still come first: same and relation, then split, then clarify, in both `orderSweepCards` and the ask order in `selectors.ts` (920). Sweep's candidates today are todos and notes only, so habits are new here: a habit with a live ask joins the deck as a plain card (kind tile, title, meta line and the strip, nothing else), and the worker counts it too.
2. **The strip in Sweep:** `AskStrip` on Sweep's current card replaces both popups, and answers run through `answerAsk` and `applyDropRelation`. Not now there, or moving on without answering, calls `lapseAsk`: the item stays as it is and is never asked about again, and the card carries on as a normal Sweep card. The relation code takes items of any kind.
3. **Same as this one? in the wrap up:** a question card with both items, as in the prototype's side note: Gremly's face and Same as this one?, two rows (kind tile, title, and a state such as due today or added tonight), and Keep just one or Keep both. Keep just one is stage 6's merge with Undo; Keep both marks the relation kept; passing lets it go and both stay. If the wrap up was skipped, the next morning's quick sweep shows the same card once.
4. **Splits:** the split step (step 0.25 with `SweepMultiSplitStep`, CardDeckScreen 1450 to 1485 and 1894) and its bare `createTodo` (about 1594) go. An unsure split asks on its card like any other question. Each piece of a split made that day shows a small Keep as one action on its Sweep card; it runs stage 7's Keep as one for the whole group and drops the other pieces from the deck.
5. **The worker's count:** `quickSweepItems` follows the same ask rules, reading `views.ask_since` and the pending markers on todos, habits and notes, so the morning notification counts exactly the cards the quick sweep shows. The wrap up count (`eveningItems`, 97) follows the same rules. Both sides count days the same way: DateService in the app, `personDay` with `dayEndHour` (`workers/shared/day.js`) in the Worker. Both file headers keep saying the two must stay in step, and both run the same shared test cases.
6. **Old questions:** 281 items hold a question nobody answered (277 notes, 2 todos and 2 habits, across 21 people, the newest from 8 September), and 89 notes still wait on a split (7 people). Under the new rules they would have lapsed long ago, so they lapse quietly rather than fill anyone's wrap up: `askOf` treats an ask with no `ask_since` as made on the item's own day. James runs this once, in one paste, right after the build ships, so the app and the worker agree from the first morning:

```sql
-- Questions nobody answered before this build (no ask_since): let them go, as the new rules would.
update notes set clarification_resolved = true,
  views = coalesce(views, '{}'::jsonb) || '{"clarification_resolved": true, "clarification_lapsed": true}'::jsonb
where coalesce(archived, false) = false
  and (needs_clarification is true or views->>'needs_clarification' = 'true')
  and not (coalesce(clarification_resolved, false) or coalesce(views->>'clarification_resolved', 'false') = 'true')
  and not (coalesce(views, '{}'::jsonb) ? 'ask_since');

update todos set clarification_resolved = true,
  views = coalesce(views, '{}'::jsonb) || '{"clarification_resolved": true, "clarification_lapsed": true}'::jsonb
where coalesce(archived, false) = false
  and (needs_clarification is true or views->>'needs_clarification' = 'true')
  and not (coalesce(clarification_resolved, false) or coalesce(views->>'clarification_resolved', 'false') = 'true')
  and not (coalesce(views, '{}'::jsonb) ? 'ask_since');

update habits set clarification_resolved = true,
  views = coalesce(views, '{}'::jsonb) || '{"clarification_resolved": true, "clarification_lapsed": true}'::jsonb
where coalesce(archived, false) = false
  and (needs_clarification is true or views->>'needs_clarification' = 'true')
  and not (coalesce(clarification_resolved, false) or coalesce(views->>'clarification_resolved', 'false') = 'true')
  and not (coalesce(views, '{}'::jsonb) ? 'ask_since');

-- Drops still waiting on a split: kept as one, as they look today.
update notes set views = views || '{"split": {"status": "kept", "lapsed": true}}'::jsonb
where coalesce(archived, false) = false
  and views->>'is_multi' = 'true'
  and views->>'minddrop_stage' = 'multi_pending';
```

**Tests:** selector and quick sweep tests for asks of each kind made today, yesterday and earlier; a shared fixture file run through both `quickSweep.ts` and `sweepCount.js` that must give the same cards; CardDeckScreen tests that Not now lapses, that the same card's two answers work, and that no split step appears.

**Gate (James):** in the simulator, tap Not now on a card, then see the wrap up ask; skip the wrap up and see the morning quick sweep ask; skip again and the question is gone with the item as it was. Then check the morning notification's count against the quick sweep on his own account.

**Done when:** Sweep has no popups and no split step, and no question is asked more than once in Sweep.

## Stage 9: where it lives

Filing starts as soon as the drop is saved, and its answer shows as the last part of the meta line, with one tap to fix. This is the Worlds handoff's filing chip, built here. Size: small. The data fabric is merged, so this goes in the same app build as stages 4 to 8, once James has deployed the data fabric's Worker changes. An `assign-worlds` reply that carries `filed` proves they are live.

**Today** (main, after the merge): `assignDropToGraph` (`lib/minddrop/dropPipeline.ts` 160) runs after the drop completes (called at 83) and calls `assign-worlds` (`cortex-index.js` from 10383). Its reply carries `filed: {by, world: {id, name}, chapter: {id, title}, starts_something}` from the data fabric's filing (`workers/inngest-jobs/context/filing.js`); `lib/minddrop/filing.ts` reads it (`filingFromReply`) and the store keeps it by saved id (`dropFilings`, `setDropFiling`, dropPipeline 213 and 214). Nothing on screen shows it yet. This stage reads that and changes nothing in filing.

**Build**

1. Call filing straight after the save (stage 4's saved point) instead of after complete, for every piece of a clear split, and still never for external calendar events. The card settles once the details and filing have both answered, within stage 4's 5s cap. Filing at the save means it no longer gets the details' tags, people or date (`assignDropToGraph` sends them when present, 186 to 191); it still gets the drop's own words, title and kind. **Gate (James):** before shipping, replay filing on about 100 recent drops with and without those fields (the `assign-worlds` call as the Worker makes it) and list every drop whose World or Chapter changes. If James judges the loss real, file once the details land instead, and let the place fade in late.
2. **The place:** the Chapter's title when it was filed into one, otherwise the World's name, otherwise nothing. Read `dropFilings[id]` for this session's drops and the store's `dropWorldLinks` and `dropChapterLinks` for older cards, through one small formatter the Worlds build can reuse. It is the last part of the meta line, with `Compass`, as the prototype's Lisbon trip and Home. If filing answers after the cap, the place fades in alone with the same .35s rise.
3. **One tap to fix:** tapping the place opens `components/overlay/WorldsChapterPicker.tsx` (`visible`, `entityId`, `entityDropType`, `onClose`). The picker already saves the person's choice as theirs (`assigned_by: 'user'`, through `lib/repo/linkingRepo.ts`; the store's `pinDropToWorld`, 9633, does the same), and filing never moves it again.
4. **Never asked:** nothing filed means no place and no question, as the Worlds handoff decided. `starts_something` is not shown on the card.
5. **Handoff note:** add a line to `docs/worlds/HANDOFF.md` that the drop card's part of the filing chip is built here, so the Worlds build only adds the same place to the wrap up's cards.
6. **Measure:** an `app_events` row when someone changes a place from a drop card, so the share of filings people change can be counted, as the handoff asks.

**Tests:** filing starts after the save and not after complete; each split piece is filed; the place shows the Chapter, else the World, else nothing; a place the person picked is never replaced; the late fade happens only when filing misses the cap.

**Done when:** a new drop shows where it lives within the settle, and a tap fixes it.

## Stage 10: the speech bubble

Gremly's reaction is now the only place Gremly comments on a drop. It arrives with the sort, at the same moment the card changes, and never repeats the card. Size: small.

**Today** (`app/screens/CatchAllNotepad.tsx` 1541 to 1648): the bubble listens for `drop:reaction_ready` (`message`, `rawReaction`, `followUp: 'multi' | 'clarify' | null`), handles the guided training drops (steps 1 to 4), avoids anything in `recentSpeech`, and shows the reaction, a fixed follow up line from `lib/speech/followUpMessages.ts` (Tap the card and I can split or keep as one; Tap the card when you have a sec), or both in turn. The event fires after the title call, about 4s in (`dropPhases.ts` 496); a multi drop gets the fixed line and no reaction (389).

**Build**

1. Stage 4 emits `drop:reaction_ready` at the sort, once the kind and the words are both in, so the bubble and the card change together at about 2s. If the title call is later than that, the reaction shows when it lands, up to the settle; after the settle it is dropped, so Gremly never comments on a drop the user has moved past. When the title call fails, the existing fallback lines stay as they are.
2. A multi drop gets its reaction like any other: the title call at the tap sees the whole drop. The pieces' own reactions are not shown.
3. Both fixed follow up lines go, since the question or the split is already on the card. `followUp` is then always null; the field and `followUpMessages.ts` are removed in stage 11.
4. After a tap on the card, the bubble shows the short outcome line (stages 6 and 7), always as a statement, with no new AI call. **Nothing in the bubble asks the user anything** (decided 9 October), so no one mistakes Mind Drop for a chat and answers in their next drop. Rewrite as statements every fixed line that asks something after a drop, after an answer, on an error or in a growth moment: in `lib/speech/gremlySpeech.ts` the `todo_with_date` Next? line, `RETURNING_USER`, `RAPID_FIRE`, `ai_failed`, the `generic` error lines and the sweep nudge's Want to sort through them? (`SWEEP_NUDGE.short`, 274); in `lib/speech/momentWords.ts` the growth lines Do I look it? and What's next?. The empty box greetings that invite a drop (the morning, afternoon and evening pools, `EMPTY_STATE` and the afternoon return lines (`RETURN.time_shift.afternoon`, 326)) stay as they are.
5. The guided training drops keep their raw reaction plus training prompt. Check each step with the earlier timing, above all step 1, where the reaction is held for the gauge modal (`pendingTrainingReactionRef`).
6. The celebrations path (`celebrate()` and the gauge preview, 2841 to 2893) is untouched.

**Tests:** the reaction shows at the sort with the card; a multi drop gets a reaction; no follow up line ever shows; a reaction later than the settle is dropped; the training steps behave as before; and no line in the after drop, answer, error or growth pools of `gremlySpeech.ts` and `momentWords.ts` asks a question.

**Gate:** the reaction's words were already read by James in stage 2's words replay. In the simulator, the bubble and the card change at the same moment.

**Done when:** every drop gets one reaction, at the sort, and no line in the bubble restates the card.

## Stage 11: clean up, after an impact audit

Remove what the new card, the new order and the one way to ask have left behind, and nothing else. Size: medium. Every removal starts with an impact audit written into the handoff note: every import, call, string and test that names it, in the app and in both Workers, and what still needs it. Anything with a caller left stays, and the note says why. One commit per removal, with jest green after each.

**Candidates**

- **The v2 fallback chain** in `lib/minddrop/dropPhases.ts`: `classifyV2` (326), `mightBeMulti` (70 to 90, a word list check in the AI path, against the house rule), `detectMulti.ts`, the `runPhase1` fallback, and `heuristicClassify.ts` if nothing else uses it. Without it, a classify failure retries the drop and then shows the failed row, rather than quietly running a weaker path; classify-v3 already falls back to Luna inside the Worker. `FEATURE_FLAGS.CLASSIFY_V3_ENABLED` (`lib/config/featureFlags.ts` 96) goes with it, and the Worker var `CLASSIFY_V3_ENABLED` must then stay "true", which the handoff note and `wrangler.toml` both say. The Worker routes that builds already out still call stay until those builds are gone (decided 9 October: until Expo shows no sessions on older builds for two weeks).
- **The card note**, everywhere it is left in the app: `sessionCardNotes`, `cardNote` on the queue item, and the field in `callPhase1_5a`'s types.
- **The old card parts:** `PendingSkeleton`, `EnrichingSkeleton`, `RevealingCard`, `ShimmerPlaceholder` (with its test), and `Row3Chips` with `RecentDrops.row3chips.test.tsx` if no other screen uses it.
- **Dead code found in the review:** `MidConfidenceChips` (still rendered at CatchAllNotepad 3457; check whether it can ever show), `ClarificationIndicatorChip` (only its test imports it), `splitMultiDrop` and `multi_awaiting`.
- **The popups and split screens** once stages 6 and 8 leave them without a caller: `MultiSplitModal`, `SweepMultiSplitStep`, and `ClarificationPopup` and `RelationPopup` unless something still opens them: today they are drawn in `contexts/OverlayContext.tsx` (719, 731), `CardDeckScreen.tsx` (1313, 1325) and `UnifiedOverlayV2.tsx` (6706, ClarificationPopup only). `resolveSkippedClarification` if nothing calls it.
- **The bubble's follow up lines:** `lib/speech/followUpMessages.ts` and the `followUp` field on `drop:reaction_ready`.
- **`titleCase`** in the Worker, once stage 2 has moved every live caller to `sentenceCase`, with the dead code around it: `processPhase2Response` (3877, never called), `sanitizeTitle`, `stripLeadingMeta` and `dedupeTitle` with their word lists (about 3580 to 3730). `isStopTag` and `parseDaysFromText` stay, because other routes use them.
- **Phase 2's event title, which is thrown away:** stop asking for it. That is a prompt change, so run 100 drops from the words replay set through Phase 2 before and after and diff every other field; ship only if nothing else moves.
- **Render logs:** the `console.log` calls inside render paths in `RecentDrops.tsx`, `CatchAllNotepad.tsx` and `CardDeckScreen.tsx` (the `sweepLog.debug` logger stays).

**Done when:** the audit for each removal is in the handoff note, the full jest run matches the baseline or better, and the app builds.

## Stage 12: tests and the final audit against the prototype

Prove the build matches what James locked: the look, the timing, the cost and the accuracy. Size: small, but nothing ships to everyone until it passes.

1. **Tests:** the full jest run in the app and in `workers/cortex`, compared with the baseline from Before you start; no new failures. The prompt rule tests (no dashes, no examples, no word lists) pass for every prompt this build touched.
2. **House rules sweep:** search the diff for em and en dashes in any string a user reads or any prompt; new word lists, regexes or pattern matching in the AI path; anything switched on only in development; dates not through DateService; icons not from Lucide; text below 12 points in new styles. Each hit is fixed or listed for James.
3. **The prototype, side by side:** a fresh model, not the builder, plays every moment of the prototype (A simple drop, Obvious split, Unsure split, Unclear drop, Already have it, Already on your list, A feeling) against the simulator, on a small phone and a large one, with reduced motion on and off, and lists every difference in look, timing, words or motion. James decides each one; the known iOS blur gap from stage 5 is already listed.
4. **Timing:** a few days of real drops on James's and the tester's phones, read from stage 4's `app_events`. The middle should sit near 2.0s sorted and 4.0s settled, the slow end near 2.9s and 6.2s; compare with the `ai_usage` baseline.
5. **Cost:** a week of `ai_usage` per drop against about 0.37¢ (0.62¢ once Google's January price applies), with `minddrop-relate/drop_relate` on `gpt-6-luna` and chat's `entity_match` still on Gemini.
6. **Questions and lapses:** after two weeks, one query for questions per 100 drops before and after, and how many asks were answered on the card, answered in Sweep, or lapsed. James reads it; it is not a gate.

## Deploying, switches and rollback

James pushes, deploys, merges, builds and runs SQL; the builder never does. Every Worker change keeps serving the app builds already out: they ignore a missing card note and the new `split` field, never send `piece_questions` or `write_question: false`, and so behave exactly as today.

| Order | What ships | How | Rollback |
| --- | --- | --- | --- |
| 1 | Stage 1, the already have it check on Luna | Cortex Worker deploy | `MODEL_DROP_RELATE = "gemini-3.8-flash"` and redeploy |
| 2 | Stage 2, the title and reaction call | Cortex Worker deploy, after James's yes on the words replay | Redeploy the previous Worker |
| 3 | Stage 3, classifier v3.8 | Cortex Worker deploy with `CLASSIFY_PROMPT = "v3.8"`, after the locked set passes | `CLASSIFY_PROMPT = "v3.7"` |
| 4 | Stage 4's Worker part (`write_question: false`) | Cortex Worker deploy, before the app build | Redeploy the previous Worker |
| 5 | Stages 4 to 10 | One app build: simulator, then TestFlight for James and the tester, then the store | The previous build, or republish the previous EAS Update if it went out as one (the changes are JavaScript only and the runtime policy is the app version) |
| 6 | The old questions SQL (stage 8) | James runs it once after the app ships | Rows keep their question; `clarification_lapsed` marks every row it set |
| 7 | Stage 9, where it lives | In the same app build, once James has deployed the data fabric's Worker changes | The previous build |
| 8 | Stage 11, clean up | The build after, once the first has settled in | The previous build |

**Switches:** no app feature flag, and nothing switched on only in development. One Worker setting is new: `CLASSIFY_SPLIT_AUTO` (stage 3), which James can set to "false" to make every multi drop ask instead of splitting. The app does not carry the old and new order side by side, because keeping both would double the riskiest code; rollback is the previous build. The Worker's model and prompt settings stay the quick levers for stages 1 to 3.

## Decided on 9 October, and risks

**Decisions** James made on 9 October, already written into the stages above:

1. **Titles** are the thing itself in the user's words, in sentence case; when it happens, how often, how long and how they feel are left out (stage 2), and the replay proves every left out detail was caught by the details. The banned phrase lists are already gone with the data fabric's prompt; the reaction's filler and Ooh filters go; the dash swap stays as a logged backstop.
2. **Splits** aim for the prototype. If the classifier cannot yet tell clear from unsure reliably on the locked set, it ships with every multi drop asking on its card, tuning carries on with the design set, and automatic splits switch on once the clear list James reads is clean.
3. **People and tags** come off the drop card and stay on the item's own screen.
4. **Free text answers** stay: Something else on every clarify strip (stage 6), so a weak question never leaves anyone stuck.
5. **Gremly's bubble never asks the user anything** (stages 2 and 10). The empty box greetings that invite a drop stay.
6. **The v2 Worker routes** stay until Expo shows no sessions on older builds for two weeks.

**Risks**

- **Saving at the sort** means a drop exists before its details. A crash in between leaves a saved item waiting for them. Covered by the `saved` phase resuming after a kill, its tests, and the duplicate key path that keeps a retried insert safe.
- **A wrong clear split** makes items the user has to fold back. Covered by the clear list James reads in stage 3 and Keep as one on the cards and in Sweep.
- **Titles and reactions written before the kind is known** could drift. Covered by the words replay James reads in stage 2.
- **Luna misses some duplicates** that Gemini caught (about 6 in the 628 drop replay). A miss now only means a duplicate stays; nothing is ever merged without a tap.
- **Sweep and the morning count drifting apart.** Covered by the shared fixtures in stage 8.
- **The data fabric merge.** It is merged; its Worker changes must be deployed before the app build that carries stage 9.
- **Google's January price.** About 0.62¢ a drop from then, still below today's 0.69¢.
- **The size of stage 4** for one builder. Covered by working stage by stage with tests first, a handoff note after each stage, and a second model reading the stage 4 diff before James tests.
