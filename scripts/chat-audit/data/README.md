# Chat audit data

Real beta chat turns for the helper model test (September 2026). Keep this repo private.

## turns.json

1,000 user turns from Space chat (615) and Ask Gremly (385), pulled 29 Sep 2026 from `scope_chat_messages`. Rules, fixed before any turn was read:

- empty turns dropped
- exact duplicates (same text, ignoring case and whitespace) keep the first only
- automated bursts dropped: any account hour with more than 20 user turns (5 hours, 134 turns)

That left exactly 1,000 turns from 23 accounts across 332 chats. One account is 52% of them. The order in the file is a fixed pseudo random order (md5 of the message id plus a salt), and `n` is the position in that order, so a practice set and a locked set can be cut by position.

Each turn has the message (`text`), the previous assistant reply cut at 500 characters (`prev_a`) and the previous user turn cut at 200 (`prev_u`), which is what the Worker's triage classifier sees, plus the chat type, the Space name if any, the turn's position in its chat (`seq`), the date and short ids. No running summary: it is not stored per turn.

These score the pre generation jobs: mode, depth, search need, personalisation, and the one call variant.

## general_chats.json

All 146 Ask Gremly chats with messages, pulled the same day: every user and assistant message in full, the items the background extraction proposed (`extracted_items`), which of those the user saved (`saved_ids`) and dismissed (`dismissed`), the current running summary and the auto title. 110 chats had extraction run; 232 items were proposed and 22 were saved.

These score the after reply jobs: background extraction (the Save items pill), the running summary, and the full chat summary. Extraction is scored per chat, because the Worker extracts from the whole conversation.

Saved is a strong yes. Not saved is weak evidence, since many people never touch the pill, so extraction gets human labels rather than being scored on saves alone.

## lane_turns.json and the lane labels (agent plan step 6)

Every Ask Gremly turn from turns.json (385) plus every Ask Gremly and today's thread turn from 23 Jul to 2 Oct 2026 (109 after the same rules), pulled 2 Oct 2026. Each keeps its set: the audit's dev, test and reserve, and the new turns cut 30% dev, 70% test by md5 of the message id plus a salt. One hour of James testing change cards on 29 Sep (22 turns, more than 20 in an hour) breaks the burst rule, so it is its own set, `extra`, scored apart.

The lane (quick, lookup, agent) was labelled on dev, test and extra by two blind labellers who saw only `LABEL_GUIDE_LANE.md` (`labels_lane_A.json`, `labels_lane_B.json`); an adjudicator with `ADJUDICATION_CONTEXT_LANE.md` settled the turns they split on (`adjudicated_lane.json`, open questions in `adjudicated_lane_policy.md`). The guide restates `LANE_RULES` in `workers/cortex/triage.js`; when the rules change, relabel with the new guide. Scored by `../score-lane.mjs`.
