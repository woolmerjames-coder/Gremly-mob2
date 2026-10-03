# What each lane does inside Gremly (for the adjudicator)

The two blind labellers only saw the guide (`LABEL_GUIDE_LANE.md`). You also know what the app will do with each lane once general chat moves onto the agent, so use that to judge which lane serves the person best.

## Quick

Today's reply path, unchanged. One streamed reply. The reply sees what Gremly holds: the person's story and context, today's plan and activity, the last three days, and whatever its recall finds for the message. It can search the web inside the reply. Alongside it, a matcher reads the person's whole item list; when the message clearly refers to one of their items, it can show that item's card with one proposed change to one field, or its details. First words in about 3 seconds.

## Lookup

The agent with read tools only: search their items, read one item in full, read any day, recall past conversations, search the web. A status line shows at once; the reply comes in about 6 seconds. It changes nothing.

## Agent

The agent with the read tools plus a card of proposed changes: any field of any item, several items at once, new items, a task list when several things were asked for. Nothing changes until the person taps. Status lines while it works; up to 10 seconds on a slow turn, and it costs more per message.

## What a wrong lane costs

- Agent sent to quick: the change may be missed, or only one field of one item offered.
- Quick sent to agent: a few seconds slower and dearer, but the reply is still right.
- Lookup sent to quick: Gremly may answer without the facts it needed, and risk guessing.
- Quick sent to lookup: a few seconds slower.
