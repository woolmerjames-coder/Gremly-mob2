# Gremly

Gremly is an AI personal companion app (Expo and React Native, a Zustand
store, Supabase, and two Cloudflare Workers: `workers/cortex` for chat and Mind
Drop, `workers/inngest-jobs` for the brief, context and notifications).

The agent work (one agent core for the daily brief, general chat and Sweep) is
handed over in `docs/agent/HANDOFF.md`. Read it before working on chat, the
brief, the change model or anything in `workers/cortex/agent`.

## Rules that hold everywhere

- No dashes as punctuation in anything written: prompts, UI words, commit
  messages, docs.
- Prompts use semantic rules only: no examples, no word lists, and no pattern
  matching in the AI path unless James has confirmed it. Never put his own data
  into a prompt as an example.
- Never hide an issue behind a guard; say what you found.
- Dates through DateService (no bare `new Date()` in app code); app data in the
  Zustand store; Lucide icons; an approved mockup is the spec; nothing switched
  on only in development builds.
- A corpus or replay run comes before any prompt or model change.
- James pushes, deploys, merges and builds. Give him SQL for migrations rather
  than applying them.
