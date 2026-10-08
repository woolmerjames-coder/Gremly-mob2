# The shadow runner

Runs a pipeline job's own code for one real person on a past day, week or
correction, and keeps every write aside. It is how each stage of the data
fabric is tried on existing data before it is deployed.

## Setting it up, once

1. James runs `scripts/sql/shadow_reader_role.sql` in Supabase. It makes a
   role that can read and cannot write any table.
2. James mints its key on his own machine and adds the printed line to
   `.audit-keys.local`:
   `SUPABASE_JWT_SECRET=... node scripts/shadow/mint-key.mjs`
3. The model keys (`OPENAI_API_KEY`, `GEMINI_TEST_API_KEY`, and
   `ANTHROPIC_API_KEY` for weekly jobs) come from the same file.
4. The project's gateway only takes the project's own public key as `apikey`,
   so the runner also needs the app's anon key, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   from `.env.local` (or the same key as `SHADOW_SUPABASE_APIKEY`). It only
   gets a request through the gateway; the shadow_reader token still decides
   what the database lets it do.
5. The machine running it must be allowed to reach the project's host
   (Claude's network settings, for runs from Claude).

The runner refuses to start with any key that is not the shadow_reader one,
or with an apikey that is not the public anon key.

## Running it

    scripts/shadow/run.sh morning    --user <uuid> --day 2026-10-05 [--at 04:30]
    scripts/shadow/run.sh story-copy --user <uuid>
    scripts/shadow/run.sh correction --correction <uuid> [--said "other words"] [--as-is] [--was-open <fact ids>]
    scripts/shadow/run.sh story      --user <uuid> --replies <file>
    scripts/shadow/run.sh person-words --user <uuid> [--weekly-replies <file> --week-end YYYY-MM-DD]
    scripts/shadow/run.sh weekly-summary --user <uuid> --at ISO --replies <file> [--rpc-from <file>]
    scripts/shadow/run.sh ledger     --user <uuid> [--from ISO] [--to ISO]
    scripts/shadow/run.sh weekly-input --user <uuid> [--at ISO]
    scripts/shadow/run.sh people-fill --user <uuid> [--at ISO]
    scripts/shadow/run.sh reread     --user <uuid> [--from ISO] [--to ISO] [--max n]
    scripts/shadow/run.sh kinds      --user <uuid> [--calls n]
    scripts/shadow/run.sh life-morning --user <uuid> --day YYYY-MM-DD [--at HH:MM] [--timings <kinds summary.json>] [--add-facts <reread record.json>]

A correction is replayed on the ledger as it stood when it was said: facts
written since, and its own, are not read; each fact reads with the state it
had then; what the run would write to a fact is read back over it. `--was-open`
names facts to read as not yet private, which no change row records, and
`--as-is` reads live as it stands. `--said` replays it with other words in
place of what was said.

The story, person-words and weekly-summary jobs need Claude. Where Claude
cannot be reached they read its answers from a replies file kept beside the
shadow output, never in the repo, and save what still needs one beside it
(`<name>-needs.json`) for `scripts/weekly-replay/run.sh answer` to fill.

Each run bundles to a file of its own, so runs side by side in one tree are safe.

Add `--code <dir>` to run another tree's code, such as main from
`git archive`, beside this one on the same day.

## What it does

- The clock reads the chosen moment. Reads are cut to rows made by then.
- Every insert, update, upsert, delete and function call that is not known to
  only read is kept in the shadow record and never sent.
- The chat cache, Inngest steps and events, push notifications, the cortex
  worker and any other host are stubbed and recorded.
- Usage rows the code would write are kept as the shadow cost, apart from
  live cost.
- Model calls go out as in production.

Results are saved under `Claude outputs/shadow`, which git ignores. Real data
never goes into the repo, fixtures or prompts.

## SQL not applied yet

A tree whose SQL James has not applied yet still runs. The runner looks for
what this tree's SQL adds (THIS_TREE_ADDS in run.mjs) before it starts. What
live lacks is answered as the SQL would leave existing rows: a new column is
null on every row, so it is taken out of the select, given as null, and a
filter on it is judged against null; a new table has no rows. The summary
names it under pending_schema.

## Its limits

- A past day is rebuilt from rows as they stand now, cut to what existed then.
  An item edited since shows its new state. The change log in stage 1 is what
  makes later reruns exact.
- A correction is replayed on today's lines (the day, the words, the story),
  which already carry it: no record keeps what they said before. A fact the
  correction moved into a state step one does not read (changed, corrected)
  is not read back.
- Reads of `life_facts` and `life_people` are cut by when a row was made, and
  reads of the view `life_facts_now` are not: a past week replayed from before
  the people records existed has no people, and its facts can include later
  ones.
- Weekly review and journal page sources can only be tried with made up people
  until real rows exist.
- In the catch up, what one window would add is kept aside, so a later window
  of the same run does not see it, as it would live.
- Real records go to OpenAI, Google and Anthropic under the replay keys, the
  same providers production uses.
