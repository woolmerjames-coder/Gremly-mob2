# The data fabric: handover

Read this before working on anything that reads or writes what Gremly knows
about a person: the ledger, the daily picture, the brief, the weekly pass and
summary, Worlds and Chapters words, Gremly's questions, the story, corrections
or chat's picture of their life. It covers stages 0 to 7, built on
`data-fabric-revamp-10.6`. The stage docs (Claude Docs, "Data fabric stage N")
hold the replays and the reasoning; this file says where things are now.

The rules that shaped it hold for any change to it: code never decides what
matters or writes a sentence; no pattern matching on the person's words;
semantic prompt rules only, with no examples, word lists or anything from
James's data; nothing made, merged, closed or deleted without a tap, except
first Worlds; what the person wrote is never written over; private stays off
anything glanceable; blank is better than wrong; an issue is said, never
hidden behind a guard; a replay comes before any prompt or model change; one
writer for each field; no dashes as punctuation; James applies SQL, pushes,
deploys and merges, and no session drops a table or column.

## The record

| What | Where | Written by | Notes |
| --- | --- | --- | --- |
| Facts about their life | `life_facts` (read through the view `life_facts_now`) | the reader, `workers/inngest-jobs/context/reader.js`, from everything they record | Each fact has one of seven kinds, a health flag, a private flag and a timing (dated, yearly, standing). `kinds.js` gives a kind to facts that lack one. |
| How a fact changed | `life_fact_changes` | the reader, corrections, tidy ups | One row per state change, with where it came from. |
| The people in their life | `life_people`, `life_fact_people`, `life_person_names`, `person_merges` | `context/people.js`; the weekly pass for what it understood (`context/unsure.js`) | Who someone is comes from what they said (`relationship_by` `gremly` or `person`), or, since 18 Oct, from what the records make plain (`understood`, James's "know it, ask only if unclear"): every writer uses it as known and says it is Gremly's understanding (`workers/shared/whoSaid.js`), anything they or a fact state takes its place, and a correction that says it is wrong clears it for good. A merge is proposed, done on a tap. `life_people.matters_rank` is who matters most to them now, as the weekly pass judges it. |
| The people on a Chapter | `chapter_people` | the weekly pass (`weekly.js` `chapterPeoplePlan`), and the person | The pass names who is part of each Chapter; code keeps someone only when a fact the Chapter's notes cite, that can be shown, is about them, writes them as `gremly`, and never touches a row the person wrote. A reader joins live people only: a merged or hidden record stays until the next pass. When the app lets someone take a person off a Chapter, it needs a way to keep them off, or the next pass puts them back. |
| What Gremly is not sure of yet | `life_unsure` | the weekly pass (`context/unsure.js`); the person's answer confirms it or says no | What the records point to but do not state: who someone is to them, or anything else that shapes their life. Kept apart from the facts, never shown, never read by any writer of something shown; the app cannot read the table. Gremly's questions ask about it, a yes becomes a fact in their words, a no closes it, and one the pass stops giving fades after three weeks. Who someone is, when the records make it plain (sure high, with the tie), is held as `understood` and never asked; given again less sure, it is a question again. |
| When a Chapter ends | `chapters.end_date`, `end_date_source` | the weekly pass (`weekly.js` `chapterEndPlan`, `applyChapterEnds`), the person's answer to a Chapter question (`context/chapterAnswers.js`), and the person | The pass names, first and apart from everything it writes (`begun_for`), the fact about what each Chapter was begun for, never what was filed in it since or its own earlier notes (decided beside the notes, it followed what they already said). Code reads that fact's day, the last day of a stretch, none for one with no last day or for what holds with no day, keeps it as `synthesis` on an open Chapter, never over a date the person set (`user`), and refuses one before the Chapter began. A passed end is what stops filing into a Chapter and makes it a close question. |
| What each stored sentence rests on | `passage_refs` | every writer under the check | One row per table, row and field: the facts, people and items it rests on, the writer and its prompt version. Corrections find sentences here. |
| What the check did | `check_runs` | every writer under the check | Per run: how many sentences it read, sent back, left out, and which steps found them wrong. Never words. Something to watch, not a gate. |
| Gremly's questions | `gremly_questions` | `context/questions.js`, `peopleQuestions.js`, `chapterQuestions.js`, `review.js`, the reader and the weekly pass (its questions, and a Chapter forming) | Answers come back as corrections with surface `question`. At most six wait at once (`QUESTIONS_WAITING_MOST`, the welcome back and anything held to a later day apart). The reader and the weekly pass take room by weight (`context/questionRoom.js` `takeRoom`): one that needs an answer comes first, and with no room it holds back the newest waiting one that only helps and was never put to them for a week (`hold_until`), never dropping it; the other writers take what room is left. None ever questions their calendar, which keeps its own entries, or asks whether something on their list is done. The review no longer offers to set facts aside as not about their life (8 Oct): it judged their own work by its topic. A set aside tidy up still waiting is closed by any tap and moves nothing. |
| What they put right | `user_corrections` | the app, chat, the brief | Applied by `context/corrections.js`. |

## Writers, what they write, and who reads it

Every writer below goes through the shared check in `workers/shared/check`:
code holds what a sentence states to the records (`stated.js`), one words
question asks whether the sentence says anything about who, when or how many
that its records do not hold (`words.js`), a sentence that fails goes back
once to its writer alone with only its own records, and one still wrong is
left out (`run.js`). Until 8 Oct the weekly pass was the one writer not under
it; since stage 7 every note it writes is checked before anything is applied
(`weekly.js` `checkWeekly`), its stored notes with the words question only,
and a World's or Chapter's notes that fail keep the notes they had when those
still hold. The weekly pass and the summary also ask a second reader of
another family (`checkSecond`, Gemini 3.8 Flash), only before something would
be left out for its words: what the first reader finds is put right first,
and a sentence is left out only when both say its last version does not hold.
Asked first, the replays showed it keeping real slips, such as calling
someone family whose tie is not recorded. A line seen at a glance that rests
on something private and on other records goes back once with only the
others. The words question is given the person's own pronouns.

| Writer | Writes | Model | Read by |
| --- | --- | --- | --- |
| The daily picture, `context/daily.js` | `user_daily_state.dco`: headline, day shape, lead, focus, claims, reach | Luna | the app's Today, the brief, chat |
| The brief, `workers/inngest-jobs/brief` | today's thread opening | Gemini 3.8 Flash | the app |
| Filing, `context/filing.js` | which World or Chapter an item belongs to | Luna | Worlds |
| The words, `context/words.js` | the line under each open World and Chapter (`card_subtitle`), from what is filed there, with what the Sweep cleared from their list marked as cleared; Chapters first, each writer given the words already under the others so that each says what is particular to it | Luna | Worlds and Chapter cards, the life pack |
| The memory, `context/memory.js` | a closed Chapter's memory (`epigraph`) | Luna | the Chapter page, a World's eras |
| First Worlds, `context/firstWorlds.js` | a new person's first Worlds | Luna | Worlds |
| The weekly pass, `context/weekly.js` | the Life Map, the profile, Gremly's notes on Worlds and Chapters, what each Chapter was begun for, a Chapter forming offered as a question, questions, the week note, the summary plan, the week's counts, notes on people, what it is not sure of, who someone is when the records make it plain, and who matters most (`context/unsure.js`). It reads the whole of their life together: up to 400 open facts, what changed lately, the week's journal, chat and list, and since 18 Oct everything they added in the last four weeks with the World or Chapter each is filed in. It never changes a World's phase | Sonnet, Luna when it fails | everything that reads the Life Map; the summary; the line about a person; the week's questions |
| One person, one record, `context/peopleJoin.js` | in the weekly people step: two records Gremly proposed may be one person are joined when the records make it plain (the same name with nothing setting them apart, or a record stating the name and the tie of the other), marked as Gremly's in `person_merges.moved.by`; the rest stay proposed and are asked. A pair they kept apart, or a join they undid, is never joined again. A correction that says they are two puts them apart (`joined_wrong`, `undoMerge`). James, 18 Oct: no more duplicate people unless they are clearly different | Luna at medium effort | everything that reads people |
| The week's questions, `context/peopleQuestions.js` | one set of up to five questions a week about the people in their life and what Gremly is not sure of, the people who matter most first, what Gremly thinks offered as the first answer | Luna | the brief, the wrap up and Ask Gremly's questions |
| Gremly's Chapter questions, `context/chapterQuestions.js` | once a day: whether a Chapter past its end, or long quiet, is over; and the welcome back after time away. A question about a Chapter no longer open is put away. Suggesting a new Chapter moved to the weekly pass on 18 Oct: this daily suggester saw only drops filed in no Chapter, so a launch worked on inside a World was never offered | Luna | Ask Gremly's questions, and the brief for the welcome back |
| Their answer about a Chapter, `context/chapterAnswers.js` | on their answer only: a Chapter started with what the suggestion rested on filed in it, one closed, its days moved, or a passed end taken away when they say it is still going | Luna | Worlds |
| The weekly summary, `summaryFromPass.ts` and `summaryPlanWriter.ts` | the weekly summary deck, from the pass's plan. A card that fails is repaired, not rewritten; an opening that fails is tried three times more at once, then falls back to the plan's checked character and the week's figures, so a deck is never lost to one card | Sonnet | the app's weekly summary |
| The story, `context/story.js` | the monthly story: milestones, shifts, proud moments, patterns, people | Sonnet | Your Story, chat |
| The line about a person, `context/personWords.js` | `life_people.words` | Luna | the life pack (`workers/shared/lifePack.js`), so chat, today's thread and the brief |
| Corrections, `context/corrections.js` and `correctionPassages.js` | fact states, new facts, and every sentence resting on what changed, each through its own writer | Gemini 3.8 Flash for step one; each writer's own model after | everything above |

Chat (`workers/cortex`) reads their life through the life pack, the Life Map
projection and the agent's lookups. The correction check runs after every
chat message (`workers/cortex/context/corrections.js` `checkTurn`): the model
says whether the message just sent puts something right, or asks Gremly to
delete or forget something, and code sends that whole message, in their words.
Until 18 Oct code kept only a quote the model found inside the message, and
the model often took its own instruction for their message: plain
corrections were missed (16 of 24 on `scripts/chat-correction-replay`, 24 of
24 since).

Known gaps in the weekly pass, from its replay of 18 Oct (weekly-2026-10-18u):
something forming inside a Chapter they have is offered as a Chapter of its
own (4 of 4 runs), what they are deciding about is offered and asked about
once (4 of 4), and steps that may lead somewhere they never said they are
going are put in not sure rather than offered (the unsure week, 2 of 2). One
made up week still has them offered: someone learning a language, looking at
flats abroad and writing to a council there is offered "Moving to" that place,
with "keep it as an idea" among the answers (0 of 5 runs leave it out), which
is James's call. The pass sometimes names a Chapter's first day as what it was
begun for; code refuses that end, so the Chapter stays open. What the pass is
shown of a Chapter's title and earlier notes shapes what it writes: marking a
title as theirs had it write that the title was theirs, so only notes they
wrote are marked now.

Gremly's read of their life as background (18 Oct, James's ask). The narrower
writers (the words, the line about a person, the memory, the Chapter
questions, the week's questions, the review, the reader) can each be given the
Life Map the weekly pass writes, as background that is never a record: nothing
rests on it, nothing cites it, and nothing it says is said unless a record the
writer is given holds it too (`context/lifeMap.js`, behind
`LIFE_MAP_BACKGROUND`). Side by side on the three real accounts, two rounds,
read blind by Sonnet and Sol with the records the writer was given
(`scripts/shadow/background-compare.sh`), no setting was a clear gain: with the
Life Map the words were judged better 41 times and worse 30, the line about a
person 21 and 22, a memory 27 and 22 with more untrue statements (16 against
7); thinking harder (`CONTEXT_EFFORT_<JOB>`) was much the same at a third more
cost; Sonnet left out far more lines at the check and cost 15 to 25 times as
much. The Chapter questions, the review and the week's questions had too few
real items to read. So it ships off. Each writer's effort can be raised on its
own without a code change (`effortFor` in `context/llm.js`).

## Corrections, in three steps

1. Step one reads what they said, the ledger's latest 300 open facts, the live
   date anchors and the lines Gremly showed them that their words may be about
   (today's lines from the brief or chat; a World's or Chapter's lines from
   its screen or chat), and says which facts are corrected, changed, happened,
   private or set aside (only when they ask Gremly to delete or forget it;
   saying how much something matters to them never sets it aside), what is
   true instead, with its timing and, for a stretch, its last day, which lines
   are not so, and who Gremly understood someone to be that they say is not so.
2. Code changes the facts and people as it says, then finds in `passage_refs`
   every sentence resting on what changed, adds the named lines, and sends each
   to its own writer: a named line, or one resting on a fact they said is
   wrong, is written again first with what they said, then checked; any other
   is asked about and written again only when it no longer holds. What still
   fails is cleared. A field the person wrote (`*_source = 'user'`) is never
   written over. A day closes up over cleared lines and what each line rests
   on moves with it.
3. The profile, which no writer records yet, is read once against what changed.

Known gaps in corrections: a fact older than the latest 300 cannot be put right (James has
450 open facts; a January fact sits at 426). The Worlds headline
(`dco.worlds_summary.headline`) comes from the weekly pass and cites nothing,
so a correction cannot reach it, and the daily build copies it from the pass
each morning; the fix is for the pass to give it refs and the daily build to
carry a corrected one. Sentences written before their writer recorded refs
are reached only when named.

## Switches

Both workers' `wrangler.toml`. Each says what it does beside it.

| Switch | Now | When to change |
| --- | --- | --- |
| `CONTEXT_PIPELINE` | on | stays on |
| `WORLDS_OLD_FIELDS` | keep | "stop" once the Worlds build says the old screens are gone |
| `CHAPTER_QUESTIONS` | on (since 8 Oct) | stays on; their answers are acted on by `context/chapterAnswers.js` |
| `SUMMARY_FROM_PASS` | on (since 18 Oct, James's call) | stays on; the summary replay from the weekly pass's plans passed first |
| `WEEKLY_CLASSIFIER` | off (since 18 Oct, James's call) | stays off: it judged by topic and made Worlds and Chapters without a tap. A Chapter forming is offered by the weekly pass |
| `WEEK_READ_FROM_PASS` | off | "on" when the weekly review's build agrees, the week replay runs with it on, and the week note holds no private matter |
| `PERSON_WORDS` (both workers) | on (since 8 Oct) | stays on; it needs `supabase/migrations/20261016090000_data_fabric_stage6_person_words.sql` applied first |
| `LIFE_MAP_BACKGROUND` | off | "on", or a list of writers, once a side by side run shows it helps them: off on 18 Oct after two rounds on real weeks showed no clear gain |

## Replays and the shadow runner

Every prompt or model change has its replay first. Real data never goes into
the repo, fixtures or prompts: replays use made up people, and the shadow
runner reads live through a read only role and writes nothing.

| Replay | Covers |
| --- | --- |
| `scripts/morning-replay`, `day-replay`, `life-replay`, `brief-corpus` | the daily picture and the brief |
| `scripts/reader-replay`, `kinds-replay`, `people-replay` | the ledger, kinds and people |
| `scripts/filing-replay`, `words-replay`, `first-worlds-replay` | filing, the words and memory, first Worlds. The words replay's `set` mode writes one person's words in the worker's order, with one habit filed in every World, and its judge asks whether each line says something of its own. Its judge also asks whether a line shows it understands what that part of their life is to them, and `--life-map` gives each writer a made up Life Map as background |
| `scripts/people-questions-replay`, `chapter-questions-replay`, `review-replay`, `correction-replay` | Gremly's questions and their answers; `chapter-questions-replay --answers` reads made up answers to the Chapter questions |
| `scripts/chat-correction-replay` | the chat correction check: what puts something right, a delete, and what never does (a plan they change, a question, how Gremly talks, an earlier message) |
| `scripts/weekly-replay`, `week-replay`, `worlds-parity`, `classifier-replay` | the weekly pass and summary, the weekly read, the classifier. The weekly replay's `unsure` week, its `judge` step and its `questions` step cover what Gremly is not sure of and the week's set of questions; its full week holds a Chapter whose race has passed, to check its end date; its six forming weeks (made up people, three with something forming inside a World, a Chapter or nowhere, three with nothing to offer) check a Chapter forming |
| `scripts/corrections-replay` | corrections: a label, a date, a never happened, a named line, a private mark, a delete and something said to matter little, a yes and a no to something Gremly was not sure of, and who Gremly understood someone to be, put right or kept, and two records Gremly joined, put apart or kept as one |
| `scripts/chat-replay`, `ask-replay`, `writer-test` | Ask Gremly |
| `scripts/enrich-replay` | Mind Drop's enrichment rules (`workers/cortex/enrichRules.js`) alone: `time` holds the time estimates to a span on made up tasks, `people` who an item mentions; each beside the rules they replaced with `--old`. On 18 Oct, on gpt-6-luna as it ships: time 91 of 96 against 93, people 48 of 48 against 48 |
| `scripts/minddrop-prompt-replay` | the prompts in `workers/cortex/minddropPrompts.js` and the agent's web search tool, called as the worker calls them, beside the old ones (`--old`, a module made from the tree before). On 18 Oct: details 66 of 66 against 61, time through the whole details prompt 65 of 68 against 58 (the old one gave no estimate for appointments), the reclassified drop's kind and dates 18 of 18 both with its reaction judged in voice 16 of 18 against 8, the reaction for a drop judged in voice 23 of 32 against 12 with titles and lengths within two of the old either way, the running summary judged no worse on any question, and searching right 49 of 50 both |
| `scripts/people-replay`, `people-join-replay` | the people a record is about (a husband named three ways is one record; two Sams never are), and the join of records the records make plainly one person: 21 of 21, no wrong join |
| `scripts/habit-builder-replay --stage` | the habit builder with Gremly's voice for how long it has known them (`context/gremlyAge.js`) |

`scripts/shadow/background-compare.sh` runs the narrower writers for real
people under several settings (the Life Map off and on, thinking harder,
Sonnet) and has two judges read each item beside the base setting blind, with
the records the writer was given; its report holds real words and is written
outside the repo.

`scripts/shadow/run.sh <job>` runs one job for one real person on any tree,
its writes kept aside; `scripts/shadow/README.md` lists the jobs. Jobs that
need Claude where Claude cannot be reached (weekly-summary, story,
person-words) read its answers from a replies file kept beside the shadow
output and save what still needs one for `scripts/weekly-replay/run.sh answer`.
The correction job replays a correction on the ledger as it stood when it was
said. The `not-sure` job runs this week's weekly pass for a real person, shows
what Gremly would not be sure of and who matters most, and the week's set of
questions that would follow, writing nothing.

## Held for deletion

`SUMMARY_FROM_PASS` went on and `WEEKLY_CLASSIFIER` off on 18 Oct. Nothing
below is deleted until each has been watched for two weekly days. Each needs a
search for other readers first. Until then the old paths still hold code that
reads words, which runs only for them: the classifier's bundle drops calendar
entries whose title starts with cancelled (`unifiedUserBundle.ts`), and the old
summary writer's prompts carry a word list.

| Once | Delete |
| --- | --- |
| `SUMMARY_FROM_PASS` is on and watched | the old summary path in `workers/inngest-jobs/inngest-index.js` (the 21 day snapshot, the analyst run and its observations, `rebuildLifeMap`), `analystPrompt.ts`, `analystObservations.ts`, `generateAdaptiveSummary.ts` and the summary writer pieces only it uses |
| `WEEKLY_CLASSIFIER` is off and watched | the classifier step in `week/index.js`, `worldsClassifier.ts`, `worldsWeeklyRun.ts`, `processWorldsWindow.ts`, `unifiedUserBundle.ts`, `worldsWriter.ts` and what only they use |
| `WORLDS_OLD_FIELDS` is stop | the old Worlds fields' writes behind `workers/shared/worldsFields.js` |
| always | `scripts/shadow` jobs for paths that are gone |

Any table or column that goes with them is James's SQL to write and apply.

Real data from before the data fabric was taken out of the repo on 18 Oct:
the analyst, summary, vibe and corpus outputs, the observations about Dave,
`dist-cortex`, `gremly-handoff-jan26`, and the real Mind Drops and chats with
their results under `scripts/minddrop-audit` and `scripts/chat-audit`; the
ignore rules keep such outputs out. They are still in the git history until
James rewrites it. `workers/cortex/context/contextBuilder.js` is read by
nothing.

The chat worker's prompts (`workers/cortex/cortex-index.js`), from what its
model calls show since logging began on 3 Oct. Rewritten on 18 Oct as semantic
rules, each with `scripts/minddrop-prompt-replay` or `scripts/enrich-replay`:
Mind Drop's title, card note and reaction, the same after a clarification,
a drop's details (time, dates, effort, state, mood, habit days, people), the
running summary of a long chat, and the agent's web search tool. Still with
examples and dashes, to rewrite the same way when they run: the habit
builder's three prompts, saving a Space chat, the full and the item chat
summaries, the second enrichment pass, the web search tool of Space, World,
Chapter and item chat (`makeWebSearchTool`), and the eleven prompts of Mind
Drop's v2 fallback, which runs only when classify-v3 fails. Seven more are
dead: weekly-summary, organize-day, sweep-headline, classify-phase1,
journal-analyze, floor-suggest and the old item chat.

## What to watch

`scripts/sql/data_fabric_watch.sql`: the check by job and by step, each
correction and what it cost, what each writer's sentences rest on, the summary
beside the old one, what the weekly pass noted of people, the line about each
person, and the story's check. A number that looks off is said and fixed;
nothing waits on it.
