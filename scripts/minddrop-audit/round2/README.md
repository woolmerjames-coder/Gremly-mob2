# Mind Drop audit, round 2

Tests designs (not just models) for classifying Mind Drops, on 1,000 new random drops that nobody picked. The write up is in `docs/2026-09-29-minddrop-model-audit.md`.

`data/` holds real beta drops and labels. Keep this repo private.

## Setup

Same as round 1: Node 22 or later, keys in `.env.audit.local` at the repo root. Run from this folder:

```
cd scripts/minddrop-audit/round2
node run-design.mjs single_v35:gemini-3.8-flash test r1 3     # one design, locked test set
./run-list.sh design r1 3 checklist:gemini-3.8-flash plain41:gpt-6-luna-low
node test-report.mjs                                           # tables, paired tests, by kind of drop
```

Results go to `results/` (gitignored). Gemini 3.8 Flash allows 10,000 requests a day per model on our tier, so one full test run (1,000 drops) plus retries is fine, but a day of several runs is not.

## The two sets

- Design set: the 450 round 1 drops (`../data/dev.json` and `../data/holdout.json`), relabelled by three blind labellers with James's rules (`data/LABEL_GUIDE_v2.md`), plus James's 52 answers. Gold: `data/design_gold.json`. Used to build and compare designs, so its scores are optimistic.
- Test set: 1,000 new drops picked at random from beta (`../data/test2.json`), labelled the same way, plus James's 58 answers (`data/review3.json`). Gold: `data/test_gold.json` (`data/test_gold_pre_review.json` is before his answers). Locked: only frozen designs were run on it, and nobody read its drops for prompt ideas.

Labels from each labeller are in `data/labels/`. The labeller instructions are `data/labeller_prompt.txt`.

## Designs

Each design is named `design:model`.

| Design | What it does |
|---|---|
| `single_v35:<model>` | One call, today's v3.5 prompt (the Worker default). |
| `plain41:<model>` | One call, v4.1 prompt: v3.5 plus ordered decision steps and three more principles. |
| `checklist:<model>` | One call, v4 prompt: v4.1 plus a facts checklist the model fills first. James's habit rule is then enforced in code from those facts (`classifyV4.mjs`, `gateHabit` in the Worker). |
| `specialists:<model>` | Flash-Lite with the checklist first. Multi, habit and unclear drops go to a specialist prompt on `<model>`. |
| `cascade:<model>` | Same fast first step, but risky drops go to `<model>` with the ordinary checklist prompt. |
| `referee:<model>` | Luna and Flash-Lite in parallel. If they disagree, `<model>` decides. |
| `second_opinion:<model>` | Luna with the checklist. When it wants to ask, the question specialist on `<model>` looks again. |
| `second_opinion41:<model>` | Same, with Luna on the shorter v4.1 prompt (faster). |

`prompts/v3.5b.js` pins the Worker module the designs were built on, so later Worker edits do not change them. `FREEZE.txt` has the hash of every prompt and script at the moment the test set was run.

## Scripts

| Script | What it does |
|---|---|
| `run-design.mjs <design:model> <design\|test> <tag> [concurrency]` | Runs one design over a set. `LIMIT=20` for a quick check. |
| `run-list.sh <set> <tag> <concurrency> <design:model> ...` | Several designs in a row. |
| `test-report.mjs [nameA nameB]` | Test set tables: accuracy, silent mistakes, needless questions, multi pieces, whether the answers offered cover what the user meant, time, cost. Paired against today's v2 chain if a `run-v2.mjs test2` result is in `../results/`. Two names compare those two. |
| `run-parts.mjs <multi\|question> <model> <tag>` | Design set part tests: a multi specialist, and question writers. |
| `part-report.mjs` | Tables for the part tests. |
| `rescore-gates.mjs <resultsFile> [set]` | Re-applies the current habit rule to a saved checklist run without new calls. |

Today's v2 chain on the test set: from `..`, `node --import ./loader.mjs run-v2.mjs test2 prod gpt-4.1-nano 1` with `WORKER_DIR` pointing at the committed Worker (see `../README.md`).
