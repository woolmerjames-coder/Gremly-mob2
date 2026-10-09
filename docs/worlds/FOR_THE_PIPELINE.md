# What the pipeline work takes from the Worlds rethink

For the session that revisits the weekly run and the context jobs on Inngest.
Written 5 Oct 2026 from the Worlds rethink. Its companion is
`docs/worlds/HANDOFF.md`, which the Worlds build reads. James reads the docs;
this file is for you.

What is stated as fact here was checked against main at f39c0f1c and the
live database (Supabase project `pvfnnpcfmgczlcglvlzl`) on 5 Oct. A table
cell that says "Not checked" means just that. Line numbers are near, not
exact. Check anything again before you rely on it, and measure costs again
from `ai_usage`.

This file and `HANDOFF.md` were written into the main checkout and are not
committed yet.

## Why this file exists

James decided on 5 Oct to do the pipeline work before the Worlds build. The
reason is simple: Worlds is the most visible reader of what the pipeline
writes. The line of words on every World and Chapter, where each drop is
filed, and every question Gremly asks about them all come from here.

The new Worlds is missing seven things. Five are pipeline jobs: first Worlds
for a new person, suggesting a Chapter as a question, asking before closing,
fresh words, and cutting back the Sunday classifier. The other two belong to
the Worlds build: a memory at the moment a person closes a Chapter, and
Worlds and Chapters in the change model.

A pipeline plan written without this file would be tuned for the Worlds
that is being thrown away.

This is one input to your plan, not the whole brief. James's own aims for
the pipeline work come first: getting rid of inaccuracies, a setup that does
not create them again, and cost. He will give you those himself.

## Words used here

- **The pipeline**: the background jobs that read what someone records and
  write Gremly's understanding of them. Most run on Inngest
  (`workers/inngest-jobs/`). Filing a drop runs in cortex
  (`workers/cortex/`).
- **The Sunday classifier**: the job `worlds-weekly-run`.
- **The weekly synthesis**: the job `context-weekly-synthesis`.
- **The daily picture**: what `context/daily.js` writes each morning about
  someone's day, which the brief is built from.
- **The brief** and **the wrap up**: Gremly's morning and evening
  conversations in today's chat thread.
- **The box**: the Tell Gremly box at the foot of the Worlds home and of
  every World and Chapter page. It is the chat agent pointed at that page.
- **A Gremly**: the mascot outfit a World or Chapter wears, stored as
  `mascot_slug`. The classifier's catalogue of them is `MASCOT_CATALOG` in
  `worldsClassifier.ts`. Gremly with no "a" is the companion himself.
- **Luna**: GPT-6 Luna, the cheap fast model most small calls use.

## Read first

- The Worlds doc, four tabs. The Round three tab has the data findings and
  the Round four tab has the order of work:
  https://claude.ai/code/artifact/63679fbd-d409-4180-b47f-3cd146f8c44e
- The prototype James approved as the spec ("this is what we need to build"):
  https://claude.ai/artifact/2U3v13GTKdNCFLQrp1zbwC
- The weekly review build plan. Its second batch moves the weekly synthesis
  to each person's own weekly day, and its weekly read reads Worlds and
  Chapters: https://claude.ai/code/artifact/37dbe8b4-c594-4335-aec6-9c0eaf59997b
- `docs/agent/HANDOFF.md` for the agent, the change model and how to work in
  this repo.

## The new Worlds in six lines

- A World is a part of someone's life. It has a name, a Gremly, and one line
  of words. A person can hide one.
- A Chapter is anything with a shape. There are no kinds any more. It has a
  title, one World, one or two lines of words, sometimes dates, sometimes
  people, and sometimes a Gremly outfit of its own. The dates decide how it
  behaves.
- Your story is the closed Chapters, each with a closing memory.
- Steps, the countdown, the next step and progress are read live from todos
  and dates in the app. Nothing is stored for them.
- Nothing is made, merged, closed or deleted without a tap. Gremly suggests,
  shows what the suggestion is based on, and the person decides. The one
  exception is a new person's first Worlds, which are made for them.
- One question at a time, a no is remembered, and nothing is ever asked at
  the moment of dropping.

## Who writes to Worlds and Chapters today

| Job | Code | When | Model | What it writes |
| --- | --- | --- | --- | --- |
| `worlds-weekly-run` | `worldsClassifier.ts`, `processWorldsWindow.ts`, `worldsWriter.ts`, scheduled by `worldsWeeklyScheduler.ts` | Sunday 10:00 UTC, for everyone `get_active_people(30)` returns | `claude-sonnet-4-6` unless `WORLDS_CLASSIFIER_MODEL` is set | New Worlds and Chapters. Chapter updates, including closing them. The closing line (`epigraph`), people (`with_you`), stage labels, arc shape, key moments, slips, priorities. World archetypes, module layout, velocity, going dormant and coming back. Life contexts. Reclassifications |
| `context-weekly-synthesis` | `context/weekly.js` | Sunday 11:00 UTC on main. The weekly review plan moves it to each person's weekly day. That was not built on 5 Oct | `claude-sonnet-5-5` (`weekly` in `context/llm.js`) | The Life Map. For each World: card line, summary, priorities, phase. The Worlds headline. For each Chapter: card line, summary, epigraph, stage label, priorities, sometimes the title. New questions |
| `assign-worlds` | `workers/cortex/cortex-index.js` near line 10966 | On every drop. The app calls it after the save (`assignDropToGraph` in `lib/minddrop/dropPipeline.ts`) | Luna, about 0.02 cents a drop in the 5 Oct checks | `drop_world_links`, `drop_chapter_links` and life context links, all marked `assigned_by = classifier` |
| `worlds-bootstrap` | `worldsBootstrap.ts` | By hand. Nothing in the code sends `app/worlds.bootstrap` | Sonnet | Worlds and Chapters from a person's whole history |
| Drop assignment backfill | `dropAssignmentBackfill.ts` | By hand | Not checked | Links for older drops |
| `context-correction-apply` | `context/corrections.js` | When a correction lands | Not checked | Can change a Chapter's card line, summary and epigraph |

In this file a path that starts with a bare file name, `context/` or
`brief/` is inside `workers/inngest-jobs/`. Every other path is from the
repo root.

Two things to notice. Two Sonnet calls write words onto the same Worlds and
Chapters an hour apart every Sunday. And filing, the judgment made most
often, lives in cortex and not on Inngest. The pipeline plan has to cover
it, or filing on the drop and the weekly run will keep following different
rules.

## What the 5 Oct checks found

- 23 accounts. 4 have Worlds, and those same 4 are the only people active in
  the last 30 days. The other 19 have none and the Sunday run never reaches
  them.
- 16 Worlds and 20 Chapters, 16 of them closed.
- 1,279 World links: 1,275 made by the classifier, 4 by a person. 421
  Chapter links, all by the classifier. The filing result is only written to
  the console in the app (`[AssignDropToGraph] OK`). The drop card never
  shows where a drop went. A person can only see or change it from the
  item's own screen or a wrap up card.
- `assign-worlds` returns `skipped_reason: 'empty_graph'` for anyone with no
  Worlds. It respects links a person placed (`assigned_by = user`) and can
  never propose something new. Its reply carries only how many links it
  wrote (`world_links`, `chapter_links` and `context_links` are counts),
  not which World or Chapter.
- A World or a Chapter only comes into being on the Sunday run, or on the
  bootstrap when someone runs it by hand. In the
  5 Oct checks, 59 weekly runs since 28 June had made 1 new World and 3 new
  Chapters. A new Chapter needs evidence on two different days and has to
  clear a confidence bar, so a trip is nearly over by the time it appears.
- The Sunday classifier cost 10 to 17 cents a person a run in those checks,
  so roughly 40 to 70 cents a person a month. Measure this again.
- Both weekly writers put dates into sentences once a week. One card
  written on Sunday 4 Oct named a plan for the day before, so it was out of
  date when it arrived. Summaries also talk about the person in the third
  person on a page they read themselves.
- The classifier closes Chapters itself (`close_chapter` on a Chapter
  update). Its prompt carries worked examples, some from James's own data,
  which breaks two of his standing rules.
- `gremly_questions` has 33 rows, 5 open. None is about a World or a
  Chapter. Every row's `record_table` is blank, or names `notes` or
  `scope_chat_messages`. The columns to point at any record already exist
  (`record_table`, `record_id`, `proposed_change`, `choices`, `answer`,
  `status`).
- A person is text in four places: `views.people` on items, `with_you` on
  Chapters, the free text `subject` on `life_facts`, and 47 `story_items` of
  kind person. The older `people` table has dates, notes and reminders
  columns and no rows.
- `life_facts.kind` is free text: about 65 different values across 468
  facts, and 89 with none.
- `world_observations`, `world_lineage`, `chapter_ai_suggestions` and
  `chapter_edit_log` have no rows.
- Days away is already counted in `context/daily.js`
  (`days_away_before_today`), with a `return_note` at three days or more.
  The brief asks one question a day and none on a return day
  (`brief/index.js`). The wrap up picks at most two a night
  (`workers/cortex/wrap/words.js`).

## The list

### A. Stop writing, once the new screens are live

The ten old layouts are being deleted, and these fields were written for
them. None is shown anywhere in the new design. A few have other readers,
listed below.

Your plan lists these and readies the change. The switch is thrown at
Worlds stage 4, when the Worlds build says the old screens are gone. Until
then the old screens still read them.

- On Chapters: `chapter_type`, `arc_shape`, `phase_labels` and the current
  stage key, `key_moments`, `slip_events`, `key_priorities`, the target
  description and target summary.
- On Worlds: `archetypes`, `module_layout`, `signal_velocity` and its delta,
  `world_type`, `key_priorities`, and the candidate, evolving and dormant
  phases. In the new design a World is there or the person has hidden it.
- Suggested rows. Today a suggestion can be a `chapters` row in phase
  `suggested` or a `worlds` row in phase `candidate`. In the new design
  nothing exists until the person taps, so a suggestion is a question with a
  proposed change, never a row.
- Life contexts are not on any new screen. Check what else reads them before
  deciding.

Before any of these stops, list its readers. The ones found on 5 Oct:

- `workers/cortex/context/chatProjection.js` near 900 to 980 puts a World's
  archetypes into World chat context.
- `context/story.js` near 184 and 221 gives the monthly story each Chapter's
  type and phase.
- `context/weekly.js` near 338 and 440 reads type, phase and epigraph.
- `inngest-index.js` near 9437, 10034, 10049 and 10494 reads stage labels,
  the velocity delta and the card lines. Find out what each of those feeds.
- In the app: `lib/store/worldsSelectors.ts`,
  `lib/store/chaptersSelectors.ts`, `lib/worlds/chapterDisplay.ts`, `lib/worlds/moduleLayout.ts`,
  `app/screens/ChapterDetailScreen.tsx`, `components/worlds/` and
  `components/chapters/`. The Worlds build deletes or rewrites all of these.

Stop writing a field only when nothing reads it. Never drop a column
yourself: the old tables and columns are kept for one release, and James
runs any SQL that drops or changes data.

### B. Keep, and get right

- One line of words for each World, and one or two for each open Chapter.
  Written to the person as "you". Gremly can keep his own third person notes
  for context. The words have to stay true until they are next written, so
  anything that moves from day to day (how many days are left, how many
  steps are done, a date that will pass) is left to the screen, which shows
  it live.
- A field the person wrote is never written over. Every main field already
  records who wrote it (`*_source`), and both weekly writers already respect
  `user`. In the new design, if Gremly sees it differently he offers his
  version underneath and the person chooses.
- A private fact never appears on a card. `context/weekly.js` already says
  so.
- The discretion rule from the weekly review plan applies to these words
  too: what Gremly knows about someone's health may shape what he writes,
  and his own words never name a condition, treatment or medication.
- The people on a Chapter. They feed the People row now and the people page
  later.
- A closed Chapter written as a memory: what happened and what it meant, in
  the second person, never a tally of what was left undone. The weekly
  synthesis prompt already asks for this.
- One writer for each field. Decide which job owns the words on a World and
  a Chapter, and take that field away from the other.

### C. New or changed

Each of these is a judgment the AI makes. James was clear on 4 Oct that an
earlier attempt to have code do parts of this made it stupid, cold and
wrong. Code decides ids, dates, counts and caps. It never reads someone's
words.

1. **First Worlds for a new person.** Today a new person has no Worlds until
   a Sunday run chooses to make some, and until then every drop they make is
   filed nowhere. The new design makes their first Worlds for them within
   their first days, without asking. Each needs a name, a Gremly and one
   line of words. Decide what starts it and what it costs. Returning
   accounts with no Worlds need the same catch up.
2. **Filing with one set of rules.** A drop goes into a Chapter only when
   Gremly is sure. Otherwise it goes into the World, where a wrong guess
   costs little. Otherwise it goes nowhere. It never asks at the moment of
   dropping, it never moves something a person placed, and it never makes a
   new World or Chapter. Today the reply carries only counts. It needs to
   carry which World and which Chapter the drop went to, so the drop card
   can show it. Changing the reply is yours. Showing it is the Worlds
   build's.
3. **Suggesting a Chapter as a question.** When several things point at
   something with a shape and nothing is holding them, Gremly puts one
   question on the list. There are two natural moments to notice it. The
   filing call can say that a drop fits nothing it has and looks like the
   start of something, with nothing shown at drop time. And the daily
   picture already lists the dated things in the next 30 days, which can be
   compared with the open Chapters each morning. The proposed change
   carries the title, the World,
   the dates he worked out and the ids of the items it is based on, because
   the card shows the person exactly those before they agree. A maybe gets a
   short question first, and "still an idea" is an answer that makes no
   Chapter. A no is remembered and not asked again.
4. **Asking before closing.** The Sunday classifier stops closing Chapters.
   A Chapter whose end date has passed, or that the records show is over,
   becomes a question with a proposed change to close it. Nothing closes
   while someone is away. Stopping the classifier from closing can ship
   with the pipeline build. Until the app can ask the question and act on
   the answer, a Chapter past its date simply stays open, and the person
   can close it by hand.
5. **Fresh words.** Words are written weekly, so they go stale between
   Sundays and after time away. They should be written again when the thing
   itself changes (a rename, new dates, a move, a close, a reopen) and on a
   return day. Find the cheapest model that passes the replay.
6. **Worlds questions on the one list.** Questions about a World or a
   Chapter go into `gremly_questions` with `record_table`, `record_id`,
   `proposed_change` and `choices`, and follow the rules in the next
   section.
7. **Cutting back the Sunday classifier.** Once filing on the drop, first
   Worlds and Chapter questions exist, a replay should show whether they
   catch what the classifier catches. If they do, it shrinks or goes. Its
   prompt examples come out whichever way that lands.
8. **The welcome back.** On a return day the pipeline readies what the one
   welcome back card needs: which Chapters passed their date while the
   person was away, each with a guess the person can change, and what is
   still ahead. No overdue counts and no days since. The card is the Worlds
   build's job.
9. **One record for each person.** Design and build the single person
   record, its other names, the job that keeps it, and the judgment that
   decides when a first name, a fuller name and "my brother" are the same
   person. It should hold who they are to the person, dates that matter,
   and what is going on with them. The Worlds build only builds the page
   that reads it, as its last stage.
10. **A closed set for the kind of a fact.** Free text today. It matters for
    the person record and for anything that reads facts by kind.
11. **The same day in chat.** When someone renames, merges, moves or closes
    something, Gremly's context should know before the next message, so he
    never talks about a Chapter that was closed this morning. Look at
    `context/cache.js` and what the app can tell it.
12. **Learning from moves.** A person moving an item is the best signal
    there is about filing. Decide how it feeds back. A "Not right?" on a
    World or Chapter line keeps going through `context/corrections.js`.
13. **The weekly run's timing.** The weekly review plan will stop running
    the synthesis for everyone at once on Sunday. It will run for each
    person on their own weekly day, a few hours before their summary. On
    5 Oct that was planned and not built: main and the weekly review's
    branch both still had the Sunday 11:00 UTC cron. The Worlds scheduler
    runs on Sunday at 10:00 UTC, an hour before it. Whatever is left of the
    classifier has to move with the synthesis.
14. **What the brief, the wrap up and the weekly read are told.** They
    should know the Chapter that is up next and its date. Gremly may
    mention how close it is when that is natural. No prompt tells him to
    (James, 1 Oct).
15. **Lock In.** It is gone from the app, and
    `docs/agent/SWEEP_STEP10.md` says the Worlds readers still name it.
    Take the name out of what those readers say.
16. **Logging and replays.** Every call in `ai_usage` under a job name. A
    replay with made up people for filing, first Worlds, Chapter questions
    and fresh words, run before any prompt or model change. Say what each
    new job costs a person a week. The budget in the agent docs is 10 cents
    a person a day, all in.

### D. Leave for the Worlds build

Do not build these here. They are in `docs/worlds/HANDOFF.md`.

- Every screen, the box and the chat on each page, and the drop card's
  filing chip.
- Worlds and Chapters in the change model
  (`workers/shared/changes/fields.js` rules them out today).
- Asking for a memory at the moment a person closes a Chapter, and showing
  it. The writer itself, meaning the rules and the model that turn a closed
  Chapter into a memory, is yours under B. The Worlds build calls it.
- Offering old Spaces a home, and deleting old app code.

Three small columns are new: a Gremly for a Chapter, a hidden flag for a
World, and the closing memory, which may be able to reuse `epigraph`. The
Worlds build writes that migration in its first stage. If you need one of
the columns sooner, write the migration for that column, give James the
SQL, and say so in your plan so the Worlds plan leaves it out.

## When each piece can ship

The pipeline build comes before most of the Worlds screens, so some of this
list has nowhere to show yet.

- **With the pipeline build, before any new screen:** everything under B,
  and items 1, 2, 4 (stop closing), 5, 7 (the examples come out), 10, 11,
  13, 15 and 16.
- **Built and replayed now, switched on when the Worlds build says the app
  can act on the answer:** items 3, 6 and 8, and the question half of
  item 4. A question about starting or closing a Chapter needs the app to
  be able to make or close one from the answer, which arrives with the
  Worlds build's second and third stages.
- **With the Worlds build's fourth stage:** everything under A, and the
  rest of item 7.
- **Before the Worlds build's last stage:** item 9.

Items 12 and 14 can go whenever your plan puts them.

## The rules for questions about Worlds and Chapters

James, 5 Oct: constantly asking about Worlds and Chapters would be super
annoying, above all on a quick drop. These are decided.

- Nothing is asked at the moment of dropping. Ever.
- No question is asked about where one item belongs. An unsure filing goes
  to the World, or nowhere, quietly. The person fixes it with one tap on the
  drop card if it matters to them.
- The questions that do exist are about a whole Chapter or World: start
  one, close one, and one about a Chapter that ended while the person was
  away, so that Gremly can write a better memory of it. That last one can
  be skipped.
- They share the places Gremly already asks: the brief's one a day (none on
  a return day), the wrap up's two a night, and the one button above the
  box on Worlds. They never add a slot.
- A question is asked only when its answer changes something the person
  will see. Answered once, it is gone everywhere. A no is remembered.
- At most one Chapter suggestion is open at a time.

## What the Worlds screens will read

The Worlds plan confirms the exact columns. This is the shape to write for.

| On screen | Read from | Written by |
| --- | --- | --- |
| A World's name and Gremly | `worlds.name`, `display_name`, `mascot_slug` | First Worlds, or the person |
| A World's line | One words field on `worlds` | The pipeline, unless the person wrote it |
| A Chapter's title, dates and World | `chapters.title`, `start_date`, `end_date`, `primary_world_id` | The person, or a suggestion they accepted |
| A Chapter's words | One or two words fields on `chapters` | The pipeline, unless the person wrote them |
| People on a Chapter | `chapters.with_you`, later the person record | The pipeline |
| The memory on a closed Chapter | `epigraph` or a new column | Written at the close, kept if the person rewrites it |
| Where a drop was filed | `drop_world_links`, `drop_chapter_links` | Filing, or the person |
| The question above the box | `gremly_questions` | The pipeline |
| The welcome back card | The daily picture's time away, plus the questions | The pipeline |
| Up next, the countdown, steps, progress | Todos and dates, live | Nobody |

## One thing still open

The weekly review's milestones and Chapters are the same idea: a dated big
thing with steps before it. The weekly read returns milestones with steps
and check ins, and setting one up adds step todos, with nothing holding them
together. The lean, which James has not yet agreed: a milestone set up in
the weekly review becomes a Chapter, or joins the one that already exists,
so there is one home for a dated thing with steps. Ask him before the
pipeline plan fixes either shape.

## What to do with this file

1. Read it with the links at the top, before you plan.
2. Check the facts you will lean on against the code and the data as they
   are on the day.
3. Put every item in sections A, B and C into your plan. For each one say
   whether you are doing it, changing it or leaving it, and why.
4. Ask James about milestones and Chapters before you fix either shape.
5. Write the plan as a Claude Doc, and stop for his go before building.

## How to work here

`docs/agent/HANDOFF.md` has the full list. The ones that bite on this work:

- Prompts are semantic rules only. No examples, no word lists, and never
  anything from James's own data to make a test pass.
- No pattern matching anywhere in the AI path unless James has confirmed it.
- Never hide an issue behind a guard. Say what you found.
- No dashes as punctuation, in prompts, copy, docs or commit messages.
- A replay runs before any prompt or model change, with made up people.
- A blank weekly summary is never sent.
- James applies SQL, pushes, deploys (`inngest-jobs` first, then `cortex`)
  and merges. `apply_migration` times out, so write the file and give him the
  SQL. Read only checks with `execute_sql` are fine.
- He likes the plan as a Claude Doc, short replies that link to it, and
  decisions asked as a short table with a lean.
