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
| The people in their life | `life_people`, `life_fact_people`, `life_person_names`, `person_merges` | `context/people.js` | Who someone is comes only from what they said; a merge is proposed, done on a tap. `life_people.matters_rank` is who matters most to them now, as the weekly pass judges it (`context/unsure.js`). |
| What Gremly is not sure of yet | `life_unsure` | the weekly pass (`context/unsure.js`); the person's answer confirms it or says no | What the records point to but do not state: who someone is to them, or anything else that shapes their life. Kept apart from the facts, never shown, never read by any writer of something shown; the app cannot read the table. Gremly's questions ask about it, a yes becomes a fact in their words, a no closes it, and one the pass stops giving fades after three weeks. |
| What each stored sentence rests on | `passage_refs` | every writer under the check | One row per table, row and field: the facts, people and items it rests on, the writer and its prompt version. Corrections find sentences here. |
| What the check did | `check_runs` | every writer under the check | Per run: how many sentences it read, sent back, left out, and which steps found them wrong. Never words. Something to watch, not a gate. |
| Gremly's questions | `gremly_questions` | `context/questions.js`, `peopleQuestions.js`, `chapterQuestions.js`, `review.js` | Answers come back as corrections with surface `question`. |
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
| The words, `context/words.js` | the line under each open World and Chapter (`card_subtitle`) | Luna | Worlds and Chapter cards, the life pack |
| The memory, `context/memory.js` | a closed Chapter's memory (`epigraph`) | Luna | the Chapter page, a World's eras |
| First Worlds, `context/firstWorlds.js` | a new person's first Worlds | Luna | Worlds |
| The weekly pass, `context/weekly.js` | the Life Map, the profile, Gremly's notes on Worlds and Chapters, questions, the week note, the summary plan, the week's counts, notes on people, what it is not sure of and who matters most (`context/unsure.js`) | Sonnet, Luna when it fails | everything that reads the Life Map; the summary; the line about a person; the week's questions |
| The week's questions, `context/peopleQuestions.js` | one set of up to five questions a week about the people in their life and what Gremly is not sure of, the people who matter most first, what Gremly thinks offered as the first answer | Luna | the brief, the wrap up and Ask Gremly's questions |
| The weekly summary, `summaryFromPass.ts` and `summaryPlanWriter.ts` | the weekly summary deck, from the pass's plan. A card that fails is repaired, not rewritten; an opening that fails is tried three times more at once, then falls back to the plan's checked character and the week's figures, so a deck is never lost to one card | Sonnet | the app's weekly summary |
| The story, `context/story.js` | the monthly story: milestones, shifts, proud moments, patterns, people | Sonnet | Your Story, chat |
| The line about a person, `context/personWords.js` | `life_people.words` | Luna | the life pack (`workers/shared/lifePack.js`), so chat, today's thread and the brief |
| Corrections, `context/corrections.js` and `correctionPassages.js` | fact states, new facts, and every sentence resting on what changed, each through its own writer | Gemini 3.8 Flash for step one; each writer's own model after | everything above |

Chat (`workers/cortex`) reads their life through the life pack, the Life Map
projection and the agent's lookups. The correction check runs after every
chat message (`workers/cortex/context/corrections.js` `checkTurn`).

## Corrections, in three steps

1. Step one reads what they said, the ledger's latest 300 open facts, the live
   date anchors and the lines Gremly showed them that their words may be about
   (today's lines from the brief or chat; a World's or Chapter's lines from
   its screen or chat), and says which facts are corrected, changed, happened
   or private, what is true instead, and which lines are not so.
2. Code changes the facts and people as it says, then finds in `passage_refs`
   every sentence resting on what changed, adds the named lines, and sends each
   to its own writer: a named line, or one resting on a fact they said is
   wrong, is written again first with what they said, then checked; any other
   is asked about and written again only when it no longer holds. What still
   fails is cleared. A field the person wrote (`*_source = 'user'`) is never
   written over. A day closes up over cleared lines and what each line rests
   on moves with it.
3. The profile, which no writer records yet, is read once against what changed.

Known gaps: a fact older than the latest 300 cannot be put right (James has
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
| `CHAPTER_QUESTIONS` | off | "on" when the Worlds build can act on an answer |
| `SUMMARY_FROM_PASS` | beside | "on" after two weekly days read beside the old summary (`scripts/sql/data_fabric_watch.sql`, query 6) |
| `WEEKLY_CLASSIFIER` | on | "off" once Chapter suggestions come from the Chapter questions; `scripts/worlds-parity` is what the call rests on |
| `WEEK_READ_FROM_PASS` | off | "on" when the weekly review's build agrees, the week replay runs with it on, and the week note holds no private matter |
| `PERSON_WORDS` (both workers) | off | "on" after `supabase/migrations/20261016090000_data_fabric_stage6_person_words.sql` |

## Replays and the shadow runner

Every prompt or model change has its replay first. Real data never goes into
the repo, fixtures or prompts: replays use made up people, and the shadow
runner reads live through a read only role and writes nothing.

| Replay | Covers |
| --- | --- |
| `scripts/morning-replay`, `day-replay`, `life-replay`, `brief-corpus` | the daily picture and the brief |
| `scripts/reader-replay`, `kinds-replay`, `people-replay` | the ledger, kinds and people |
| `scripts/filing-replay`, `words-replay`, `first-worlds-replay` | filing, the words and memory, first Worlds |
| `scripts/people-questions-replay`, `chapter-questions-replay`, `review-replay`, `correction-replay` | Gremly's questions and their answers |
| `scripts/weekly-replay`, `week-replay`, `worlds-parity`, `classifier-replay` | the weekly pass and summary, the weekly read, the classifier. The weekly replay's `unsure` week, its `judge` step and its `questions` step cover what Gremly is not sure of and the week's set of questions |
| `scripts/corrections-replay` | corrections: a label, a date, a never happened, a named line, a private mark, and a yes and a no to something Gremly was not sure of |
| `scripts/chat-replay`, `ask-replay`, `writer-test` | Ask Gremly |

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

Nothing below is deleted until stage 5 has been watched for two weekly days
and its switch has gone on. Each needs a search for other readers first.

| Once | Delete |
| --- | --- |
| `SUMMARY_FROM_PASS` is on and watched | the old summary path in `workers/inngest-jobs/inngest-index.js` (the 21 day snapshot, the analyst run and its observations, `rebuildLifeMap`), `analystPrompt.ts`, `analystObservations.ts`, `generateAdaptiveSummary.ts` and the summary writer pieces only it uses |
| `WEEKLY_CLASSIFIER` is off | the classifier step in `week/index.js`, `worldsClassifier.ts`, `worldsWeeklyRun.ts` and what only they use |
| `WORLDS_OLD_FIELDS` is stop | the old Worlds fields' writes behind `workers/shared/worldsFields.js` |
| always | `scripts/shadow` jobs for paths that are gone |

Any table or column that goes with them is James's SQL to write and apply.

## What to watch

`scripts/sql/data_fabric_watch.sql`: the check by job and by step, each
correction and what it cost, what each writer's sentences rest on, the summary
beside the old one, what the weekly pass noted of people, the line about each
person, and the story's check. A number that looks off is said and fixed;
nothing waits on it.
