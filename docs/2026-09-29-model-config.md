# Model config in one place, 29 Sep 2026

Every model the cortex Worker (`gentle-thunder-5854`) calls is now chosen in `workers/cortex/models.js`. Nothing about which model runs changed in this commit: every default is pinned to what production ran before, and `workers/cortex/__tests__/models.test.js` asserts that. The point is that the model review that follows becomes a config edit and a deploy, not a code edit and an app release.

## What moved

- 16 hard coded `gpt-4.1-mini` strings across `cortex-index.js`, `aiProvider.js` and `triage.js`, each now a named helper job (`helperModel('chat_extraction')` and so on).
- The chat model: `geminiClient.js` used a constant, and Space, World and Chapter chat reported it by name. All read `models().chat` now. `GEMINI_FLASH_MODEL` used to affect only the tier fallbacks; `CHAT_MODEL` now moves chat itself and falls back to `GEMINI_FLASH_MODEL`.
- The non streaming OpenAI fallback for Space, World and Chapter chat (`gpt-4.1`) and the weekly summary model (Sonnet 4.5). The weekly summary is out of scope for the current review and has its own var for later.
- The generic non streaming path used to run whatever model the app named in the request body. App builds name `gpt-4o-mini` everywhere (`EXPO_PUBLIC_CORTEX_MODEL` defaults to it, and `saveableDetector.ts`, `summaryGenerator.ts`, `enrichListItem.ts`, `cortexDecide.ts`, `conversation.ts` and `useOverwhelmFlow.ts` say it outright). The Worker now decides with `APP_HELPER_MODEL`, whose default is `gpt-4o-mini` so nothing changes today, and logs `[MODEL] app named a model, Worker config wins` when the app's request disagrees. The 13 app side model strings are dead weight and can be removed in a later app release.

## The vars

Set in `wrangler.toml` `[vars]` or the Cloudflare dashboard. All unset today.

| Var | Covers | Default |
| --- | --- | --- |
| `CHAT_MODEL` | Ask Gremly, Space, World, Chapter, Habit Builder, Entity chat streaming | `gemini-3-flash-preview` |
| `HELPER_MODEL` | every helper job below unless its own var is set | `gpt-4.1-mini` |
| `MODEL_TRIAGE_MODE`, `MODEL_TRIAGE_SIGNALS`, `MODEL_LOADING_MESSAGE` | the pre generation calls in `triage.js` | helper |
| `MODEL_RUNNING_SUMMARY`, `MODEL_CHAT_FULL_SUMMARY` | running and full chat summaries | helper |
| `MODEL_CHAT_EXTRACTION` | Ask Gremly background extraction behind the Save items pill | helper |
| `MODEL_GENERAL_GREETING`, `MODEL_ENTITY_CHAT_SHORT` | home screen greeting, short entity chat replies | helper |
| `MODEL_HABIT_PREPARSE`, `MODEL_HABIT_FIELDS`, `MODEL_FLOOR_SUGGEST` | Habit Builder and floor suggestions | helper |
| `MODEL_JOURNAL_ANALYZE`, `MODEL_SWEEP_HEADLINE`, `MODEL_CLASSIFY_PHASE1` | journal analysis, sweep headline, Mind Drop v2 chain | helper |
| `APP_HELPER_MODEL` | generic non streaming path called by app builds | `gpt-4o-mini` |
| `LEGACY_OPENAI_CHAT_MODEL` | non streaming fallback for Space, World, Chapter | `gpt-4.1` |
| `WEEKLY_SUMMARY_MODEL` | weekly summary | `claude-sonnet-4-5-20250929` |

`NANO_MODEL`, `MINI_MODEL`, `HAIKU_MODEL`, `SONNET_MODEL`, `GEMINI_FLASH_LITE_MODEL` and the `CLASSIFY_*` vars keep working as before; their defaults live in `models.js` too.

## Still to confirm

`EXPO_PUBLIC_CORTEX_MODEL` in the EAS production environment. If it is unset or `gpt-4o-mini`, the generic path is unchanged. If it names anything else, `APP_HELPER_MODEL` should be set to that value before this deploys.

## Next

Corpus test of the helper jobs (triage mode and depth, extraction, summaries) on real chat turns, four models against the current `gpt-4.1-mini`; then the chat corpus gate for `CHAT_MODEL`. Winners go in as vars, not code.

## Added the same day: provider routing, usage logs, the split behind flags

- `workers/cortex/helperClient.js`: every helper job goes through `helperFetch(job, body)`. An OpenAI model is sent exactly as before; a reasoning model gets `max_completion_tokens`, its lowest reasoning effort and no temperature; a Gemini model is translated to generateContent and answered in the OpenAI reply shape. `HELPER_FALLBACK_MODEL` retries a failed call once on another model.
- `[USAGE]` log lines from `geminiClient.js` on every Gemini call: input, cached, output and thinking tokens, time, and the lane (`label`).
- Flags, all default to today's behaviour: `TRIAGE_ONE_CALL`, `CHAT_EXTRACTION_V2`, `SEARCH_REQUIRED_FORCES`. What each does is in `models.js` and `wrangler.toml`. The proposed production setting is listed, commented out, in `wrangler.toml`; it goes live together after the chat corpus gate.

## Live setting (29 Sep 2026)

`wrangler.toml` now sets the split: `CHAT_MODEL=gemini-3.8-flash`, `HELPER_MODEL=gpt-6-luna`, `HELPER_FALLBACK_MODEL=gemini-3.8-flash`, `TRIAGE_ONE_CALL=on`, `CHAT_EXTRACTION_V2=on`, `SEARCH_REQUIRED_FORCES=off`, and `ENTITY_CARDS=on` for the entity card in chat (`workers/cortex/entityMatch.js`; the app side is `components/chat/EntityCardMessage.tsx` and `lib/chat/entityCards.ts`). James chose to judge the chat tone in the app rather than by a replay. To go back to the previous behaviour, comment those lines out and deploy.
