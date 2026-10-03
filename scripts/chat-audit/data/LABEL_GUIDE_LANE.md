# Labelling guide: chat turns (lane)

You are labelling what Gremly, a shame free companion app that keeps a person's tasks, habits, notes, events and lists, must do before it can reply well to a chat message. Label from the text you are given: the message, the previous exchange if there is one, and the kind of chat. Do not guess at the person's life beyond what the words say. Some turns are short, odd or test messages; label them anyway.

Gremly already holds a good deal about the person when it replies, without looking anything up: their story and context, today's plan and what they have done today, the last three days of activity, and whatever it recalls that bears on the message. It can also search the web inside its reply.

## The lane (use exactly these strings)

These restate the definitions the app's own classifier uses (`LANE_RULES` in `workers/cortex/triage.js`).

- `quick`: Gremly can reply from the conversation and what it already holds about this person: their story and context, today's plan and what they have done today, the last three days, and what it recalls that bears on the message. Facts about the outside world that a web search can supply also count as quick. Nothing of theirs is asked to change.
- `lookup`: replying well needs facts about the person's own things or past that Gremly may not hold: a particular item of theirs, what is planned on a day other than today, how something has gone over time, what they have of some kind, or something from an earlier conversation. Nothing of theirs is asked to change.
- `agent`: the person asks Gremly to make a change to their own things in the app, such as creating, editing, rescheduling, completing, logging, skipping or removing something, or planning things into their days, whether one change or several. Also any message that asks for several separate things to be done.

These count as asking for a change, so they are `agent`:

- saying they need or mean to do something new that Gremly could keep for them;
- accepting or answering Gremly's own offer or question about a change;
- following up a change they asked for that has not been made.

These are `quick`:

- mentioning something that could change one of their existing things without asking Gremly to change it;
- telling Gremly something about themselves, or correcting what it believes about them.

When a message asks for a change and also needs a lookup, it is `agent`. When unsure, `quick`.

## What to record for each turn

- `lane`: the single best answer.
- `lane_ok`: every answer a reasonable product owner would accept as correct, always including the best answer. Be strict: add an alternative only if you would genuinely not call it a mistake.
- `note`: up to 12 words on your reasoning when it was not obvious.

Output one JSON object per turn with the turn's `id` and the fields above, as a JSON array.
