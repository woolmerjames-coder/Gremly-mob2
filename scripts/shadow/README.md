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
3. Replays keys (`OPENAI_API_KEY`, `GEMINI_TEST_API_KEY`, and
   `ANTHROPIC_API_KEY` for weekly jobs) come from the same file.

The runner refuses to start with any key that is not the shadow_reader one.

## Running it

    scripts/shadow/run.sh morning    --user <uuid> --day 2026-10-05 [--at 04:30]
    scripts/shadow/run.sh story-copy --user <uuid>
    scripts/shadow/run.sh correction --correction <uuid>

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

## Its limits

- A past day is rebuilt from rows as they stand now, cut to what existed then.
  An item edited since shows its new state. The change log in stage 1 is what
  makes later reruns exact.
- A correction is replayed on today's facts, which already carry it.
- Weekly review and journal page sources can only be tried with made up people
  until real rows exist.
- Real records go to OpenAI, Google and Anthropic under the replay keys, the
  same providers production uses.
