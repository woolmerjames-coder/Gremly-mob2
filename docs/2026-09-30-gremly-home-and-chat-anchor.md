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

Now:

1. James's phone test of the home and the anchor (section 3).
2. Deploy the cortex Worker and ship the app build.

Chat quality. Each one is a prompt change, so each goes through the gate:

3. Replies over-personalise. They bring Bella, San Francisco, client work and the Sage deck into turns about something else, once called James someone else, and once invented a walk with Bella. This needs a session on the persona and what the reply is given about the user.
4. Extraction sometimes offers a change the message did not ask for: an add to the vet note, or a move to tomorrow, from "busy tomorrow" (J-262f, 1 in 4 runs), and Gremly's own comparison added to the Mexico note from a question (T12, 1 in 4 runs). Look at the edits rule and at the evidence check for edits.
5. Two check-ins in one message ("yesterday and again today") give a card for one day while the reply offers both. Either a card that logs several days, or the reply told only one day is on the card.
6. Low: a generic word for an item ("the entity") is taken as an item's name.
7. The runner copies the Worker's prompt assembly by hand, so every Worker prompt change has to be mirrored in `scenario-run.mjs`. Sharing one assembly function would stop the two drifting apart.

Entity chat moves to the Ask Gremly experience (agreed, to start after the above). What today's entity chat does that must survive is folded into these steps.

8. Decisions first: one chat per item that reopens (recommended) or a new chat each time; saving "onto this item" becomes the add to card (habits have nothing to add to yet); what happens to each item's existing chat.
9. Phase A: an item chat screen with the Ask Gremly look, anchored, the item pinned at the top, starters per type (todo, habit, note), reached from every current entry point (overlay view and edit rows, both habit detail pages, Sweep with its context). Finding a chat by its item needs a small database change on `scope_chats`. Keep the old screen behind a flag for rollback.
10. Phase B: the Worker gives the reply the anchored item's full detail (body, notes, tags, estimate, habit progress, Sweep context). Corpus gate.
11. Phase C: move each item's old chat (`views.chat`) into its anchored chat on first open; saved notes stay on the item and in the overlay; point the chat summary jobs, `entity_chat_count` and the feeding gauge at anchored chats; then remove the old screen and its dead parts (the unreachable notes editor, the save card that ignores its type, the unused Promote to Space, the Sweep starter that never matches).

Small home items not done:

12. Open the keyboard when Chat opens from Talk it through.
13. A first week hint under the switch (idea, not agreed).

Other threads have their own lists: `docs/2026-09-28-minddrop-fixes.md` and the 29 Sep audits. The one dated deadline among them is the gpt-4.1-nano switch off on 23 Oct 2026, which needs the Worker deployed before then.
