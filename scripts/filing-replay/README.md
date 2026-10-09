# The filing replay

`run.sh [--repeat n]` files the made up person's sixty drops (`person.mjs`)
with the filing prompt and model that ship, and scores them against
`data/gold.json` at the bar James set on 7 Oct: Chapter filings right 95 times
in 100, World filings 85 in 100. It also sweeps the cuts. OPENAI_API_KEY and
GEMINI_TEST_API_KEY come from the environment; CONTEXT_MODEL_FILING tries
another model.

How the gold set was made: two labellers, each seeing only `LABEL_GUIDE.md`
and the drops, labelled every drop blind (`data/labels_A.json`,
`data/labels_B.json`) and agreed on all sixty. An adjudicator with
`ADJUDICATION.md` kept every answer and listed five drops where the guide
leaves room (`guide_questions` in `data/gold.json`).

The guide later gained three lines, as the filing prompt did after the shadow
runs on real drops: a note on how a day went, a part of life no World covers,
and a date inside a Chapter's dates. The labellers saw it without them. No
gold answer turns on them: the drops they bear on (d05, d07, d10, d45, d47,
d48, d52, d54) were already labelled the way the lines say. When the rules
change in a way that could move an answer, label again with the new guide.
