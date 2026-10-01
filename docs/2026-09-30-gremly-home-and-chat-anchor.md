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

Updated 30 Sep, evening. Done since the first version of this list: James's phone test of the home and the anchor (all steps pass after two fixes, below); a tapped card is now always saved (step 11 of the test found it was sometimes lost, so Gremly thought nothing had changed); the Save items pill waits for its own turn instead of turning up a turn late; extraction no longer offers changes nobody asked for (a model check before any late card); one message can log several days of a habit; the reply no longer says it cannot change things; the runner uses the Worker's own prompt assembly; the keyboard opens on Talk it through; a first week line under the switch.

Now:

1. `cd workers/cortex && npx wrangler deploy` for e097fc99. The Worker is live through c156570b; e097fc99 changes what the reply is told after a tapped card (asked whether it went through, it now says yes and what the item is now; it said it was still the same and offered to move it again). Gate: `data/applied_check.json`, plus U2, V2 and X1 of the James check.
2. James retests in the simulator: typing in the Drop and Chat box (b49bf328: letters land at the end and none are lost), and test 1 again (move an item from its chat, tap Yes, ask whether it went through). The saved line on a tapped card now names the date rather than today or tomorrow.
3. When happy, a TestFlight build. Everything is on in every build, item chat included (ITEM_CHAT_V2 is true everywhere since eb5c6d18).

Entity chat moves to the Ask Gremly experience:

4. Phase A, built and on everywhere: `components/chat/ItemChatScreen.tsx` is Ask Gremly tied to the item, one chat per item found by the anchor on its opener (no database change was needed), the item named at the top, starters per kind, and the old entity chat's props, so the overlay, both habit pages and Sweep all open it. Sweep's starter sentence is now sent as the first message. Saving onto the item is the add to card, as in any chat.
5. Phase B: the Worker gives the reply the anchored item's full detail (body, notes, tags, estimate, habit progress, Sweep context). James's idea belongs here too: when a chat is about a note, Gremly draws on what the note already says and suggests what to talk about next, and what is settled can then be added. Corpus gate.
6. Phase C: each item's old chat (`views.chat`, 127 items across about 15 people, last used in May) becomes the start of its new chat the first time it opens; saved notes stay on the item; point the chat summary jobs, `entity_chat_count` and the feeding gauge at anchored chats; then remove the old screen and its dead parts.

Chat quality, each a prompt change through the gate:

7. Replies over-personalise (Bella, San Francisco, client work, the Sage deck in turns about something else). Parked by James: it is the rich context being used.
8. Low: a generic word for an item ("the entity") is taken as an item's name.
9. Low: a reply sometimes says "I'll set a reminder" when the pill or a card does the saving.

Other threads have their own lists: `docs/2026-09-28-minddrop-fixes.md` and the 29 Sep audits. The one dated deadline among them is the gpt-4.1-nano switch off on 23 Oct 2026, which needs the Worker deployed before then.
