# Mind Drop model audit harness

Tests how well a model classifies Mind Drops, using the real Worker prompt and code, on real drops with agreed answers. The write up of the September 2026 audit is in `docs/2026-09-29-minddrop-model-audit.md`. Round 2 (designs, 1,000 new drops) is in `round2/`.

`data/` holds real beta drops. Keep this repo private.

## Setup

Node 22 or later. Put API keys in `.audit-keys.local` at the repo root (it is gitignored):

```
OPENAI_API_KEY=...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Run everything from this folder with the loader, which lets Node run the Worker source as Wrangler does:

```
cd scripts/minddrop-audit
node --import ./loader.mjs probe.mjs                          # can each model be reached, and does it accept our request shape?
node --import ./loader.mjs run-v3.mjs gpt-6-luna-low dev run1  # one model, practice set
./run-many.sh dev run1 4 gemini-3.8-flash gpt-6-luna-low       # several models
node --import ./loader.mjs analyze.mjs _dev_run1               # comparison table
```

Results are written to `results/` (gitignored).

## The sets

- `data/dev.json`: 200 practice drops. Read the misses here when changing the prompt.
- `data/holdout.json`: 250 locked test drops. Only run these once a prompt is frozen, and never read them for prompt ideas, or the scores stop meaning anything.
- `data/fresh.json`: the last 1,420 eligible drops up to 29 Sep, used once to check prompt v3.6 (section 12 of the audit). Not labelled.
- `data/test2.json`: 1,000 new random drops from round 2. Gold and designs are in `round2/` (see `round2/README.md`); `run-v2.mjs` and `run-v3-worker.mjs` accept `test2` and leave scoring to `round2/test-report.mjs`.

Correct answers come from `data/labels_A.json` and `data/labels_B.json` (two blind labellers, using `data/LABEL_GUIDE.md`), with `data/review.json` (James's answers) overriding both wherever it has an entry.

## Scripts

| Script | What it does |
|---|---|
| `run-v3.mjs <model> <dev\|holdout> <tag> [concurrency]` | The one call classifier, with the exact prompt and checks the Worker uses. `PROMPT=v3.3` runs a snapshot from `prompts/` instead of the live file. |
| `run-v3-worker.mjs <split> <tag> KEY=VALUE ...` | Same, but through the real Worker route (`classify-v3`) with the given Worker vars, including backup model and hedging. Use this to confirm a config before switching it on. |
| `run-v2.mjs <split> <tag> <nanoModel> [concurrency]` | The v2 chain through the real Worker routes, as the app calls them. |
| `run-clarify.mjs <resultsFile> <writerModel> <tag>` | Rewrites the questions for drops a run marked unclear, using the standalone clarify route. |
| `judge-questions.mjs <resultsFile> ...` | Blind 1 to 5 rating of every clarifying question. `JUDGE=gemini-3.8-flash` switches judge. |
| `analyze.mjs <filter>` | Table of accuracy, silent mistakes, needless questions, time and cost (test cost and cost at real traffic). |
| `report-table.mjs '<json>'` | The markdown tables used in the report. |
| `paired.mjs <runA> <runB>` | Is B really better than A on the same drops? Difference with a 95% interval and McNemar's test. |
| `errors.mjs <tag> <min> <model> ...` | Practice drops that several models got wrong, side by side. |
| `diffruns.mjs <runA> <runB>` | Which practice drops changed between two runs. |
| `habitstats.mjs <run> ...` | False and missed habits. |
| `ledger.mjs` | Total spend so far. |

## Testing today's production code

`run-v2.mjs` imports whichever `cortex-index.js` it is pointed at. To baseline the committed version rather than your working copy:

```
mkdir -p /tmp/prod-worker && cp -r ../../workers/cortex/* /tmp/prod-worker/
git show HEAD:workers/cortex/cortex-index.js > /tmp/prod-worker/cortex-index.js
git show HEAD:workers/cortex/aiProvider.js > /tmp/prod-worker/aiProvider.js
WORKER_DIR=/tmp/prod-worker node --import ./loader.mjs run-v2.mjs holdout prod gpt-4.1-nano 1
```

Use concurrency 1 for v2: it makes about 9 calls per drop and will hit the OpenAI rate limit otherwise, which quietly switches calls to the backup model and spoils the numbers.

## Adding a model

1. Add it to `models.mjs` with its official prices, the smallest prompt the provider caches, and how long the cache lasts.
2. `node --import ./loader.mjs probe.mjs <key>` to check the request shape. Reasoning settings differ by family: OpenAI GPT-5 models take `minimal`, GPT-5.x and GPT-6 take `none` or higher; Gemini 3.8 Flash takes `low` but not `minimal`.
3. Run the practice set, twice if it is close, then the test set.

## Prompt rules (enforced by `workers/cortex/__tests__/classifyV3.test.js`)

Semantic definitions only. No example drops, no example answers, no lists of words to look for, no dashes.
