# Worlds rebuilt: handoff

For the session that writes the build plan for the new Worlds and then
builds it. Read this first, then the doc and the prototype below. James
reads the docs; this file is for you.

Written 5 Oct 2026. Code facts were checked against main at f39c0f1c and
data facts against the live database that day. Line numbers are near, not
exact. Check anything again before you rely on it.

## The project in one paragraph

Worlds is the part of Gremly that sorts what a person drops into the parts
of their life and the things they are working towards. What is built today
is a read only magazine: Gremly writes it once a week, the person can change
almost nothing, and fourteen of its buttons do nothing. James found it
unusable and confusing and asked for a full rethink. The rethink is done and
agreed. The tab now leads with what is in motion, every World and every
Chapter has one simple page, anything can be made three ways (say it, accept
Gremly's suggestion, add it by hand) and changed two ways (tap it, or tell
Gremly), and a closed Chapter becomes a memory in Your story. It replaces
the old Worlds screens and the old Spaces, and deletes both.

## Where it stands

| Piece | Status |
| --- | --- |
| Assessment of today's Worlds | Done. Main tab of the doc |
| Prototype version 1, then three looks compared | Done. James chose look A, "Up next" |
| Prototype version 2 | Approved 5 Oct as the spec: "this is what we need to build" |
| Decisions, four rounds | All made. Listed below |
| The order of work | The pipeline work goes first (James, 5 Oct) |
| The build plan | Yours to write, as a Claude Doc |
| The build | Not started. James says when, and on which branch |

## Links

- The doc, four tabs (assessment and plan, Round two, Round three, Round
  four): https://claude.ai/code/artifact/63679fbd-d409-4180-b47f-3cd146f8c44e
- The prototype, version 2, the spec:
  https://claude.ai/artifact/2U3v13GTKdNCFLQrp1zbwC
- The three looks James chose from:
  https://claude.ai/artifact/H26BTc7sfpBFNuri7aJkVx
- In the repo's `Claude outputs/` folder, which git ignores:
  `worlds-rebuilt-v2.html` is the prototype as one file, and
  `worlds-v2-source/` is its readable source (`app.js`, `body.html`, three
  style files and a README). Read the source, not the one file: the one
  file has the animations packed into it.
- `docs/worlds/FOR_THE_PIPELINE.md`: what the pipeline work takes from this.
- `docs/agent/HANDOFF.md`: the agent, the change model, and how to work here.
- The weekly review build plan, which touches the brief, the wrap up and the
  weekly run: https://claude.ai/code/artifact/37dbe8b4-c594-4335-aec6-9c0eaf59997b

## The model

- A World is a part of someone's life. There are a handful and they last
  for years. Each has a name, a Gremly and one line of words. Gremly sets
  them up. A person can rename, merge, add, hide or delete them.
- A Chapter is anything with a shape: a start and an end, or a goal. It
  lives in one World. It holds its dates, its steps, what is kept on it,
  its people and its own chat. There are no kinds to choose. The dates
  decide how it reads and what it counts down to.
- Your story is where closed Chapters go. Closing one is a small moment,
  and Gremly writes the memory.

Three words to learn: World, Chapter, Your story. Everything else that was
on the old screens goes (Emerging, Dormant, Growing, Steady, Cooling,
Unfolding, Pulse, Eras, Epigraph, With you, Also touched).

## Words used here

- **A Gremly**: the mascot outfit a World or Chapter wears, stored as
  `mascot_slug`. Gremly with no "a" is the companion himself. The outfits
  are in `lib/mascots/mascotConfig.ts`, `lib/mascot/mascotMatrix.ts` and
  `components/mascot/Mascot.tsx`, and the classifier's own catalogue is
  `MASCOT_CATALOG` in `workers/inngest-jobs/worldsClassifier.ts`.
- **The box**: the Tell Gremly box at the foot of the Worlds home and of
  every World and Chapter page.
- **A drop**: one thing a person gives Gremly on the Drop page. Filing is
  Gremly deciding which World, and sometimes which Chapter, it belongs in.
- **The brief** and **the wrap up**: Gremly's morning and evening
  conversations in today's chat thread. The wrap up is the old Sweep,
  rebuilt.
- **The pipeline**: the background jobs that write Gremly's understanding
  of a person. **The Sunday classifier** is one of them, the job
  `worlds-weekly-run`, which makes and updates Worlds and Chapters today.
- **The change model** and **the change card**: the one way Gremly proposes
  a change, shown as a card with Accept and Undo.
- **Steps**: the todos that belong to a Chapter. **Kept here**: the notes
  and lists that belong to it.

## The spec: prototype version 2

James's rule is that an approved mockup is the spec, and that it gets a
check against what can really be built. The left rail of the prototype has
eleven starting points. The right rail says what each screen is showing.

| Start from | What it shows |
| --- | --- |
| Worlds home | Up next leads on a dark card: the Chapter with the nearest date, its countdown and its next step, which ticks right there. The rest in motion is a quiet list. Ended ones wait lower down. Worlds are the row of Gremlys along the top. One question from Gremly sits as a button above the box. Looking back holds Your story |
| A Chapter | One page for every Chapter. Tap the name, the date, the Gremly or Gremly's words to change them. Steps tick, and the home screen moves with them. Kept here holds lists and notes. A part with nothing in it is left out. Words the person rewrote are marked as theirs and never written over |
| Tell Gremly from home | The box on the home screen is the chat agent. Start, close, rename, merge or hide from it. Every change comes back as a change card. It answers in place and keeps no thread |
| Save from chat | Under an answer worth keeping, a button names the Chapter it belongs to. One tap saves it as a note or a list. A small arrow picks somewhere else. A list keeps its tick boxes and stays on the Chapter, so it never floods Today. An arrow turns one list item into a step |
| One question, three places | Gremly keeps one list of open questions. The brief asks one, the wrap up at most two, and the same one waits above the box on Worlds. Answered once, it is gone everywhere |
| Back after eight weeks | One welcome back card. Nothing was closed or changed while away. Each thing that passed has a guess the person can change. Accept all does the lot and one Undo puts it back. No overdue counts and no days since |
| Say it | Mention something with a shape in chat and Gremly offers a card: the name, the World, the date he worked out, the Gremly it will wear and the items that already belong. Nothing exists until Start it. When the person sounds unsure, Gremly asks one short question first, and "still an idea" makes no Chapter |
| Add it by hand | One line and, if there is one, a date. Gremly fills in the World and what already belongs. Every field can be changed before it is made. A new World is one tap away |
| A World | The shelf: what is in motion, loose todos, habits, things kept and what is finished. The same layout for every World. Rename by tapping, swap its Gremly, merge or hide from the menu. Its own chat in the box |
| Closing one | Gremly offers to close a Chapter that has ended. He never closes one himself. He writes the memory to them in the second person and never counts what was left undone. Unticked steps stay with it and leave Today. It can be reopened |
| The first day | A new person sees a friendly start and a box. They can make something in the first minute. Their first Worlds are made for them after a few drops, the one time Gremly makes things without asking |

On every screen: the box at the bottom with Gremly sitting on it, and a
change card with Accept and Undo. On a World or Chapter page, Earlier above
the box reopens that page's conversation. The home box keeps no thread.

The prototype's welcome back example is eight weeks away. The daily picture
already treats three days or more as a return. The plan says, with James,
how long away brings the card.

In the prototype Gremly's guesses and replies are simple stand ins
(`guessOutfit`, `specFrom`, `SAYS` in `app.js`). In the app they are his
judgment, made by the agent. Nothing in the prototype is code to copy.

## The rules that keep it calm

- Nothing is made, merged, closed or deleted without a tap.
- Everything has Undo.
- Every suggestion shows what it is based on.
- One question at a time, and a no is remembered.
- A drop stays a drop. No questions at the moment of dropping.
- Nothing closes while the person is away.
- Deleting a World or a Chapter never deletes what is in it.

## Decisions James has made (keep to them)

Round one, the shape:

- Things in motion lead the tab. Worlds are the shelf underneath.
- The words stay: World, Chapter, Your story.
- One page for every World and one for every Chapter. The ten layouts go.
- Gremly suggests and the person taps. The one exception is a new person's
  first Worlds.
- Gremly may offer to start a Chapter in chat when something with a shape
  comes up, once for each thing. This widens the agent rule that Worlds and
  Chapters are never suggested. It widens it this far and no further.
- The box on each page is Ask Gremly's agent pointed at that page. Each
  World and Chapter keeps one chat that reopens. The old World and Chapter
  chat goes. "Not right?" folds into the box.
- The Sunday classifier is cut back once a replay shows the new path
  catches as much.
- Old Spaces are offered a home on one card, each as a Chapter or a World.
  Their owners say what they become. Nothing is converted silently.

Round two, after the first prototype:

- Look A, "Up next".
- No kinds for Chapters. James worried people would not be able to tell an
  event from a project, or know what a season is.
- The box is on the Worlds home too.
- After time away there is one welcome back card, and nothing closes
  without the person.
- A Chapter wears its own Gremly outfit where one fits. Otherwise it wears
  its World's.
- Steps left unticked stay with a closed Chapter and leave Today. Bring
  back turns one into a loose todo.
- Numbers that move, such as a budget or a tracker, are left out of the
  first version.
- Saving from chat is in. So is one list of questions answered in three
  places.

Round three, before the plan:

- A people page is the last stage, with no new tab. A person is reached by
  tapping their name anywhere it appears, and the Worlds home gets one
  People row beside Your story. Gremly writes the page and the person
  corrects it. It is never a contacts form.
- One record for each person is designed in the pipeline work.
- The five pipeline pieces go to the pipeline work.
- Your story sits under Looking back. This reverses James's 1 Oct call
  that made it the hero of Worlds, and he agreed to the change.
- Spaces go last, after the carry over card. Their tables are kept for one
  release before James drops them.
- The plan is written in a new chat, from this file.

Round four, 5 Oct:

- The pipeline work goes first and carries `FOR_THE_PIPELINE.md`. Stages 1
  and 2 below need nothing from it and can start once the pipeline plan is
  agreed.
- Where a drop was filed shows on the third row of its drop card.
- Gremly must not keep asking about Worlds and Chapters. The rules are in
  the next section.

Still true from earlier work: every change needs a tap and a card with
several changes has Accept all; rarely used fields are changed only when
the person asks; Mind Drop stays a simple drop with no questions; nothing
is switched on only in development builds; animations feel intentional and
never jolt.

## Filing: shown quietly, almost never asked about

James, 5 Oct: asking "does this belong here" would be annoying, and so
would wrong filing. Constant questions on a quick drop are the bigger risk.

What is true today. The app calls `assign-worlds` in cortex after every
drop is saved (`assignDropToGraph` in `lib/minddrop/dropPipeline.ts`) and
writes the answer to the console. The reply carries only how many links
were written, not which World or Chapter. The links themselves are saved on
the server, and the store only learns of them the next time it loads. So
the drop card has never shown where a drop went, and a person can only see
or change it from the item's own screen or a wrap up card: 1,275 World
links were made by the classifier and 4 by a person.

What to build:

- **The chip.** Row 3 of a drop card is the chip row, drawn by `Row3Chips`
  in `app/screens/RecentDrops.tsx`, which is the one place every chip on
  that row comes from. Add one chip that names where the drop went: the
  Chapter when it went into one, otherwise the World. It appears when
  filing answers, which is after the other chips, so it has to arrive
  without a jolt. When nothing was filed there is no chip.
- **One tap to fix.** Tapping the chip opens the picker that already exists
  (`components/overlay/WorldsChapterPicker.tsx`). A place the person chose
  is saved as theirs (`pinDropToWorld` in the store, `lib/repo/linkingRepo.ts`)
  and filing never moves it again. The cortex call already respects that.
- **The filing answer has to reach the store.** The pipeline work is asked
  to make the reply say which World and Chapter. Until it does, the app can
  read that drop's new links back when the reply arrives. Either way they
  go into `dropWorldLinks` and `dropChapterLinks`, and the chip reads the
  store.
- **Sure, or not at all.** Into a Chapter only when Gremly is sure.
  Otherwise the World. Otherwise nowhere. That rule is the pipeline's.
- **The same chip on the wrap up's cards**, which already have a World
  picker (`components/sweep/WorldPickerSheet.tsx`). That is how filing gets
  tidied in the evening: by seeing it, not by being asked.
- **From chat the button is the question.** "Save to" names the place
  before anything is saved.

The rules on questions, decided:

- Nothing is asked at the moment of dropping. Ever.
- No question is asked about where one item belongs.
- The questions that exist are about a whole Chapter or World: start one,
  close one, and one about a Chapter that ended while the person was away,
  so that Gremly can write a better memory of it. That last one can be
  skipped.
- They share the places Gremly already asks: the brief's one a day (none
  on a return day), the wrap up's two a night, and the one button above the
  box. They never add a slot.
- A question is asked only when its answer changes something the person
  will see. A no is remembered. At most one Chapter suggestion is open.
- Measure it. Once filing can be seen and fixed, the share of filings
  people change says whether it is good enough. The plan sets the bar with
  James and a replay checks it before launch.

The chip is not in the prototype. Mock the drop card's third row with it
and get James's yes before building it.

## What exists today

The screens, all replaced:

- `app/tabs/WorldsScreen.tsx` (the Your story hero is `StoryHeroCard`, near
  line 77), `app/screens/WorldDetailScreen.tsx`, `ChapterDetailScreen.tsx`,
  `YourStoryScreen.tsx`.
- `components/worlds/` (53 files: five World layouts, modules, sections,
  sheets, cards) and `components/chapters/` (22 files: five Chapter
  layouts). `lib/worlds/` has `chapterDisplay.ts`, `moduleLayout.ts`,
  `peopleAvatars.ts` and `upcomingDates.ts`.
- `navigation/TabNavigator.tsx` shows the Worlds tab to testers only
  (`isTester`). Everyone else still gets the Spaces tab.
- The old chat for a World or Chapter: `app/screens/ScopedChatScreen.tsx`,
  with `scopeType` world or chapter, calling `callWorldChatStreaming` and
  `callChapterChatStreaming`. Three chats ever, none in the last 90 days.

The store, `lib/store/useGremlyStore.ts`:

- It holds `worlds`, `chapters`, `dropWorldLinks` and `dropChapterLinks`,
  with `worldsSelectors.ts` and `chaptersSelectors.ts` beside it.
- The only actions that change a World or Chapter today are
  `updateChapterTitle`, `updateChapterDates` and `pinDropToWorld`, plus
  `refreshWorldsGraph`. Making, renaming a World, swapping a Gremly,
  moving, closing, reopening, merging, hiding and deleting are all new.
- `selectDiscoveredPeople` in `lib/store/selectors.ts` builds the list of
  people on the Hub screen from the names on items (`views.people`).

What to build on:

- The change model: `workers/shared/changes/fields.js` and `check.js`,
  `lib/changes/` (apply, undo, `links.ts`, `snapshot.ts`),
  `components/brief/ChangeCard.tsx`, `lib/brief/applyChanges.ts`. Today a
  note, todo or habit has `worlds` and `chapters` as fields that change
  only when asked, and the file's own header rules out "Worlds and Chapters
  themselves". Teaching it to make and change them, with a clean Undo, is
  the new ground in stage 2.
- The agent: `workers/cortex/agent/` (`run.js`, `surfaces.js`, `chat.js`,
  `tools/proposeChanges.js`). `app/tabs/AskGremlyScreen.tsx` is the look
  the box and its chat should share.
- Saving from chat: `components/chat/MessageWithSave.tsx`, and notes with
  tick lists (`list_items` on a note, `lib/lists/types.ts`).
- The question list: `gremly_questions`, `lib/wrapup/questions.ts`,
  `workers/inngest-jobs/context/questions.js`, the brief's question in
  `workers/inngest-jobs/brief/index.js`, the wrap up's in
  `workers/cortex/wrap/words.js`.
- The old Spaces had working patterns worth reading before they are
  deleted: making one by hand, settings, and a suggestion card that showed
  the items it would move (`components/CreateSpaceModal.tsx`,
  `components/spaces/`).

## The data

Tables that stay and already hold what the screens need:

- `worlds` (16 rows): name, display name, `mascot_slug`, summary, card
  subtitle, phase, and who wrote each main field (`*_source`,
  `*_updated_at`).
- `chapters` (20 rows, 16 closed): title, description, dates, primary
  World, summary, card subtitle, `with_you`, `closed_at`, and who wrote
  each main field.
- `drop_world_links` (1,279) and `drop_chapter_links` (421).
- `chapter_world_links` (34) ties a Chapter to other Worlds it touches. In
  the new design a Chapter shows one World, its `primary_world_id`. The
  plan says what the extra links are for now, if anything.
- `gremly_questions` (33, 5 open, none yet about a World or Chapter). It
  can already point at any record and carry a proposed change.
- `scope_chats` (695). General chat uses it too, so it stays.

Read live, never stored: steps, the countdown, the next step and progress.

4 of 23 accounts have Worlds, and those 4 are the only people active in the
last 30 days. The other 19 have none, so the first day and the catch up
matter for everyone who comes back.

Three small columns are new: a Gremly for a Chapter, a hidden flag for a
World, and the closing memory, which may be able to reuse `epigraph`. This
build writes that migration in stage 1 and gives James the SQL. If the
pipeline work needed one of the columns sooner, its plan will say so, and
that column is left out here.

## What is missing, and who builds it

| | Missing | Who |
| --- | --- | --- |
| 1 | First Worlds for a new person | Pipeline |
| 2 | Suggesting a Chapter as a question | Pipeline |
| 3 | Asking before closing. The Sunday classifier closes Chapters itself today | Pipeline |
| 4 | Fresh words between Sundays and after time away | Pipeline |
| 5 | Cutting back the Sunday classifier | Pipeline |
| 6 | A memory at the moment a person closes | The pipeline owns the writer. This build calls it at the close and shows the result |
| 7 | Worlds and Chapters in the change model | This build |

Also the pipeline's: the filing rules, making the filing reply say where a
drop went, and building the one record for each person. This build makes
the people page that reads it. The detail, and when each piece can ship, is
in `FOR_THE_PIPELINE.md`.

## The stages

Each ends with something James can use, so it can merge in four or five
pieces. The estimates are from Round three and are judgment: the agent
work took about four days, and this has more screens, a data change and
things to delete.

| Stage | What James gets | Estimate | Waits for |
| --- | --- | --- | --- |
| 1. By hand | The new home, World page and Chapter page in look A. Make, rename, change dates, move, close, reopen, merge, hide and delete, with real tick boxes. No AI needed. The ten layouts deleted | 2 to 3 days | The pipeline plan being agreed |
| 2. The box and chat | Tell Gremly on every screen, a chat for each page, saving from chat, the change model learning Worlds and Chapters | 1 to 2 days | Stage 1 |
| 3. Gremly's side | First Worlds, the question button, fresh words, memories, the welcome back card, the brief and wrap up reading Chapters | About 2 days, shared with the pipeline work | The pipeline build |
| 4. Carry over and delete | Spaces offered a home, the Worlds tab on for everyone, old screens removed | 1 day | Stage 3 |
| 5. The people page | A page for each person, reached by their name | 1 to 2 days | The pipeline's record for each person |

The filing chip can go in stage 1, because the links already exist on the
server and can be read back. Say where you put it.

## The delete list

Before deleting anything, list every reference to it, and let the full
jest run prove nothing else depended on it.

- The Spaces tab and its screens: `app/tabs/SpacesScreen.tsx`,
  `app/spaces/`, `app/screens/SpaceDetailScreen.tsx`, `components/spaces/`,
  `components/CreateSpaceModal.tsx`. There are 45 Spaces across 20
  accounts.
- `space_summaries` (33 rows), `space_milestones` (12) and
  `space_suggestions` (213). Kept for one release, then dropped by James.
- The ten layouts and everything only they used, in `components/worlds/`,
  `components/chapters/` and `lib/worlds/`. The fourteen buttons that do
  nothing go with them.
- `app/screens/ScopedChatScreen.tsx` and the World and Chapter chat calls
  behind it. On 5 Oct only the World and Chapter screens and
  `navigation/RootNavigator.tsx` referred to it. Check again.
- `world_observations`, `world_lineage`, `chapter_ai_suggestions` and
  `chapter_edit_log` have no rows. The plan says for each whether the new
  design uses it. James drops the ones that go, after one release.
- Not this build's to delete: the Sunday classifier. Cutting it back is the
  pipeline's job. It is listed here so nothing is left half removed.

No table or column is dropped by a session. James runs any SQL that drops
or changes data.

## Open questions for the plan

1. The weekly review's milestones and Chapters are the same idea: a dated
   big thing with steps before it. Setting up a milestone adds step todos
   with nothing holding them together. The lean, which James has not yet
   agreed: a milestone becomes a Chapter, or joins the one that exists.
   Ask him early, because the weekly review is being built now.
2. How making something through the change model undoes cleanly. Making a
   Chapter and gathering items into it is one change card and one Undo.
3. How a page's chat is scoped in the agent: a new surface, or the chat
   surface told which World or Chapter it is on. The home box keeps no
   thread; each page keeps one.
4. Which words field is the one line on a World and the one or two on a
   Chapter, and whether the memory reuses `epigraph`. Agree it with the
   pipeline work, which writes them.
5. The bar for filing, and the replay that checks it.
6. Whether Chapter reads clearly to a brand new person. The prototype can
   be shown to two or three people.
7. Health. Some people have a World about their health. The weekly review
   plan has a rule for it: what Gremly knows may shape what he writes, and
   his own words never name a condition, treatment or medication. That
   rule should hold on every World and Chapter page and in each page's
   chat.
8. Which todos are a Chapter's steps. The lean: every todo linked to the
   Chapter, open ones first. Confirm it against the prototype and the
   links as they are.
9. How long away brings the welcome back card.
10. The branch. James names it.

## First tasks

1. Read the doc's four tabs, then open the prototype and click through all
   eleven starting points. Read `worlds-v2-source/app.js` for what each
   screen does.
2. Read `FOR_THE_PIPELINE.md`, then the pipeline plan. James will give you
   its link. If it does not exist yet, write the Worlds plan against the
   list in that file and say so.
3. Check the prototype against what can be built, screen by screen, before
   any code. Say plainly where the app cannot keep a promise the prototype
   makes.
4. Mock the drop card's third row with the filing chip, and get James's
   yes.
5. Write the build plan as a Claude Doc: one section for each stage, with
   the files it touches, the data change, the tests, and what gets deleted
   at the end of it. Decisions for James go in a short table with a lean.
6. Stop there. James gives the go, and names the branch.

## Who builds it

The split James planned for the agent work fits here. Fable writes the
plan and builds stage 1. That is where a wrong call is expensive: the plan
settles what the pipeline owns, how the change model learns Worlds and
Chapters, and what gets deleted, and stage 1 lays the data change and the
new store actions everything else sits on. Opus 5.5 extra, as James calls
that setting, builds stages 2 to 5, which the prototype and stage 1 pin
down. This is judgment, not a measured comparison. The loop from the weekly review
plan works here too: the builder finishes one stage, stops and hands over
its commit hashes; the planning chat reads the diff, runs the replays and
checks the rules; James deploys once it passes.

## How to work here

`docs/agent/HANDOFF.md` has the full list and the exact commands for git,
tests and replays in this setup. The essentials:

- Writing: no dashes as punctuation, anywhere. That covers the words on
  screen, prompts, docs and commit messages. Plain English, warm, never
  consultant language.
- Prompts: semantic rules only. No examples, no word lists, and no pattern
  matching anywhere in the AI path unless James has confirmed it. Never put
  anything from his own data into a prompt to make a test pass.
- Never hide an issue behind a guard. Tell James what you found.
- App code: `DateService` for dates, the Zustand store for app data,
  Lucide icons, the mockup is the spec, nothing switched on only in
  development builds. Check for existing code before adding new.
- A corpus or replay run comes before any prompt or model change, with
  made up people. Anything with real personal data stays out of git.
- Git: never stash, check out or unlink files on the mount. Run read only
  git commands as `GIT_OPTIONAL_LOCKS=0 git status` and the like. The
  mount does not allow deleting, so a plain `git status` can leave
  `.git/index.lock` behind and block James's own git. It happened on
  5 Oct. If it does, move the lock out of `.git` with `mv -n` and tell
  him. Commit only your own paths. James pushes, deploys (`inngest-jobs` first, then
  `cortex`), merges and builds.
- Supabase project `pvfnnpcfmgczlcglvlzl`: `apply_migration` times out, so
  write the migration file and give James the SQL. Read only checks with
  `execute_sql` are fine.
- Model keys for replays are in `.audit-keys.local` at the repo root.
  Never print them.
- James likes a plan or write up as a Claude Doc, short chat replies that
  link to it, and decisions asked as a short table with a lean.

## Loose ends

- A second copy of the prototype was published by mistake:
  https://claude.ai/artifact/M6WWodVraAUiGq9iMZPfdr. James knows. Leave it
  unless he asks for it to go.
- This file and `FOR_THE_PIPELINE.md` were written into the main checkout
  and are not committed. Commit them with your first change, or ask James.
- `Claude outputs/_to_delete/stale-git-index.lock` is an empty leftover
  from the git lock described above. James can delete it.
