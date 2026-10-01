# Gremly home, the chat anchor and reply fixes, 30 Sep 2026

Branch: `minddrop-fixes-9.28`. Committed on this branch, not pushed. Nothing here is deployed yet.

## 1. What is on the branch

- **Gremly home** (bca1713d, 66609fd5, b8e87a25, 410f39fe). The centre tab is the Gremly button, filled grey to green by the feeding gauge, with DROP and CHAT on one page and a switch you swipe or tap. One input box serves both. The newest drop offers "Talk it through with Gremly", which opens Chat about it with a fixed opener and no paid call. While typing in Chat the switch tucks away and Gremly steps aside. Sign out moved to Settings.
- **Chat anchor** (3257772d). A chat opened from Talk it through is tied to that exact item. Every turn sends it (`anchorEntity`), including after the chat is reopened from history. The Worker keeps it on the matcher's list, marked, and tells the reply never to call it news. It is a soft anchor: which item a message means is still the model's judgement over the whole list, so the chat can move on.
- **Reply fixes** (a7297196). Cards give the reply the item's day and the change in words. The last card is described truthfully when it only showed the item. The reply never offers to change an item to what it already is, and only calls something theirs when it is the same thing. The same-thing check now has the last word on each proposed item. A deadline the item already meets moves nothing.
- **Chat audit runner.** The whole turn runs on the scenario's day, turns the Worker does not extract from are not extracted, and the last card carries its kind. `results/anchor_check.json` and `results/james_check.json` are the new baseline.

## 2. Gate results (30 Sep, production models, matcher on gemini-3.8-flash)

Anchor scenarios: every card and matcher result is right, and no reply calls the anchored item news. The habit and vet replies now name the right day.

James check, compared with the previous baseline: fixed are J-c4c7 (no longer moves the call to Sunday), J-19fd ("It was already that way"), V1 (no offer of a move to the day it already has, no card after "thanks"), T5 (logs "for today"), T6 and U4 (the passport and the Apple developer renewal now reach the pill). Differences that are model variance rather than change: T1 is sometimes an in passing card and sometimes a card that takes the reply, and V2's "Not that one" sometimes gives a choice and sometimes the other item.

To rerun (NODE_USE_ENV_PROXY is only needed behind a proxy, as in the Cowork VM):

```
cd scripts/chat-audit
NODE_USE_ENV_PROXY=1 EM=gemini-3.8-flash PILL_SPLIT=on node scenario-run.mjs data/anchor_check.json results/anchor_check.json
NODE_USE_ENV_PROXY=1 EM=gemini-3.8-flash PILL_SPLIT=on node scenario-run.mjs data/james_check.json results/james_check.json
```

## 3. Deploy and test

Either order works: the live Worker ignores the new app fields, and the new Worker reads them only when an app sends them.

1. `cd workers/cortex && npx wrangler deploy`
2. A new build or EAS update of the app from this branch.
3. On the phone: drop "Take Bella for a walk" and tap Talk it through. "I keep putting it off" should not say it is on your list. "Move it to Saturday" should give a card for the walk. "Unrelated, I need a haircut" should give no card for the walk. Reopen the chat from history and say "done": a card to mark the walk done.
4. Reply fixes: ask to move something to the day it is already on, then ask "did you change it?". It should say it was already that way.

## 4. What happens next, in order

Updated 1 Oct. Done since the last version: the typing fix in the shared box and the plain yes after a tapped card (both tested by James, Worker deployed through 63db86b2); then entity chat's move to Ask Gremly is finished (phases B and C) and the two chat quirks are fixed:

- 1d5c5ae4 Phase B: the reply is given what the item holds (`workers/cortex/itemDetail.js`): a note's text, a todo's notes and list, a habit's check-ins and smallest version, the changes made to it, how often Sweep put it off, what earlier chats covered. It builds on that and now and then suggests what it leaves open. A new chat about a note opens with up to four starters drawn from the note (type `item-topics`, kept until the note changes). Gate: `data/item_detail_check.json`.
- beafc318 The reply no longer promises to remind, keep or save anything (Ask Gremly's reply was still being asked for a save block nobody reads), and "the entity" means the item. Gate: `data/quirks_check.json` (reminder turns promising something: 12 of 12 before, 0 of 12 after), James check and anchor check rerun.
- dfa2222b The matcher knows a change they said yes to has been made, so "Did you do it?" no longer brings the same card back.
- d3cd5601 Phase C: every old item chat (`views.chat`) was copied into its item's chat. Applied to production on 1 Oct as migration 20261001012238: 127 chats, 701 messages, 13 people. `views.chat` is untouched as a copy; every added row carries `metadata_json.migrated_from = 'views.chat'`.
- cb859331 Item chats keep the item's `chat_summary` (what the context jobs read), count for training readiness (`get_training_readiness`, migration 20261001012531, applied) and feed Gremly once per opening, as the old chat did.
- c424034f The old entity chat screen, its flag, its store actions and its Cortex calls are removed. Notes saved from old chats still show on the item. The Worker's `entity-chat` route stays for builds already out.

Now:

1. `cd workers/cortex && npx wrangler deploy` (item detail, note topics, the quirk fixes, the matcher, item chat summaries). The database changes are already live.
2. James tests in the simulator (below).
3. When happy, a TestFlight build.

Found and not fixed (belongs to the context pipeline project, `lifemaps-context-fixes-9.30`): the weekly summary's fact extraction (`workers/inngest-jobs/inngest-index.js`, step extract-profile-facts) reads chat messages from `space_chat_messages`, a table that no longer exists (it is `scope_chat_messages`), and reads `views.chat` as a list when it never was one, so it has found no chat messages at all since the rename.

Chat quality, parked by James: replies over-personalise (Bella, San Francisco, client work, the Sage deck in turns about something else); it is the rich context being used.

Other threads have their own lists: `docs/2026-09-28-minddrop-fixes.md` and the 29 Sep audits. The one dated deadline among them is the gpt-4.1-nano switch off on 23 Oct 2026, which needs the Inngest worker deployed before then (`cd workers/inngest-jobs && npx wrangler deploy`) if it has not been.
