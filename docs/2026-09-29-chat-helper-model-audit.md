# Chat helper model audit, 29 Sep 2026

Which model should run the small helper calls around a chat turn: the triage that decides the kind of message, the reply length and whether to search the web, and the background extraction behind the Save items pill. Tested on 500 real chat turns and 116 real Ask Gremly conversations that nothing was tuned on. Harness and data are in `scripts/chat-audit/`.

## 1. Short answer

**Gemini 3.8 Flash wins both jobs, and the three pre reply calls should become one.**

Triage on the 500 locked turns (mode, depth and search all right; strict, meaning both labellers accept the answer):

| Setup | All three right | Mode | Depth | Search | Forced a search when none was needed | Skipped a search that was needed | Typical | Slow end (p90) | Cost per 1,000 turns |
|---|---|---|---|---|---|---|---|---|---|
| **Today** (gpt-4.1-mini, two calls) | 69.0% | 81.8% | 95.6% | 87.4% | 3 | 14 | 0.75s | 1.3s | $0.44 |
| gpt-4.1-mini, one call | 71.2% | 81.2% | 96.0% | 90.6% | 2 | 10 | 0.64s | 0.85s | $0.40 |
| **Gemini 3.8 Flash, one call** | **84.0%** | 90.4% | 98.0% | 94.0% | **1** | **5** | 1.5s | 2.6s | $1.16 |
| Gemini 3.8 Flash, two calls | 84.4% | 91.6% | 98.2% | 92.6% | 2 | 6 | 1.7s | 3.6s | $1.37 |
| GPT-6 Luna, one call | 74.0% | 87.8% | 95.4% | 88.2% | 12 | 2 | 0.9s | 1.4s | $0.10 |
| GPT-6 Luna, two calls | 73.2% | 87.4% | 94.2% | 89.2% | 16 | 0 | 1.0s | 1.7s | $0.11 |
| GPT-5 nano, one call | 34.8% | 49.0% | 85.2% | 79.6% | 14 | 13 | 0.8s | 1.0s | $0.06 |

Gemini beats today on 107 turns and loses on 32 (p < 0.0001). Luna's gains over today are not significant (p = 0.06) and it forces needless web searches, which the user feels as a slow, odd reply. Nano is out.

Extraction on the 116 locked conversations (what the Save items pill would offer):

| Setup | Items offered | Right (of 34) | Wrong offers | Missed | Chats with a wrong offer | Cut off (no result) | Typical | Cost per 1,000 |
|---|---|---|---|---|---|---|---|---|
| Production, as it ran at the time | 187 | 22 | 126 | 12 | 57 (49%) | 0 | | |
| gpt-4.1-mini, today's prompt | 173 | 24 | 115 | 10 | 61 (53%) | **12** | 2.0s | $0.86 |
| **Gemini 3.8 Flash** | **40** | **29** | **1** | 5 | **1 (0.9%)** | 0 | 1.4s | $1.53 |
| GPT-6 Luna | 77 | 28 | 27 | 6 | 15 (13%) | 0 | 1.6s | $0.18 |
| GPT-5 nano | 373 | 22 | 302 | 12 | 103 (89%) | 0 | 3.6s | $0.25 |

Same prompt for every model. A wrong offer is an item that neither labeller, nor the adjudicator, would offer: the pill shows for nothing. Today's model offers about three wrong items for every right one. Gemini offers almost only right ones and misses five.

## 2. How it was tested

**Turns.** 1,372 user turns in `scope_chat_messages`, from Space chat and Ask Gremly. Rules fixed before any turn was read: drop empties, drop exact duplicates, drop automated bursts (any account hour with more than 20 turns; 5 hours, 134 turns). That left 1,000 turns from 23 accounts, put in a fixed pseudo random order. The first 200 are the practice set, the next 500 the locked test set, the last 300 are untouched for a later round. One account is 52% of the turns. Each turn is fed to the models exactly as the Worker feeds its triage classifier: the message, the previous exchange, the Space name.

**Conversations.** All 146 Ask Gremly chats with messages, in full, plus what production extracted at the time and what users saved. 30 practice, 116 test. Fed to the models with the Worker's own extraction prompt (`workers/cortex/chatPrompts.js`), the last 20 messages, and the day of the last message as "today".

**Correct answers.** Two blind labellers, each given only the labelling guide (`scripts/chat-audit/data/LABEL_GUIDE_TURNS.md` and `LABEL_GUIDE_CHATS.md`, which restate the Worker's own definitions). They agreed exactly on 93% of modes, 95% of depths and 96% of search needs, and on the number of saveable items in 136 of 146 chats. Where they split (83 turn questions, 34 items), an adjudicator with the app context (`ADJUDICATION_CONTEXT.md`: what each answer does inside Gremly, what the search tool is, what the pill does) settled them and listed the recurring policy questions for James (`adjudicated_turns_policy.md`, `adjudicated_chats_policy.md`). Items either labeller marked borderline count neither for nor against a model. Personalisation was labelled but not adjudicated and is not in the headline number.

**Matching.** Whether two item descriptions mean the same thing is decided by a fixed judge model (gpt-4.1, not a candidate) with cached answers, so wording differences do not count as misses.

**Prompts were frozen.** Nothing was tuned on any result. The one call triage variant is the two Worker prompts joined, with only the framing and return lines new (`scripts/chat-audit/triage-jobs.mjs`).

**Speed.** Measured from a cloud machine, not from Cloudflare's edge, so compare the columns to each other, not to production.

## 3. What was learned

- **The three calls before a reply can be one.** The loading message, the mode call and the signals call run before Gemini starts. One call that returns everything is as accurate as two (for every model), faster and cheaper. Today's sequence takes about 1.4s typical before the reply starts; one Gemini call takes 1.5s and gets far more decisions right. One Luna call takes 0.9s at lower accuracy.
- **Gemini 3.8 Flash cannot switch thinking off.** With thinking set low it still spends about 100 thinking tokens (240 at the slow end) on a five token answer, and `thinkingBudget: 0` changes nothing. That is why it is slower than the OpenAI models here. It is not a cost problem: $1.16 per 1,000 turns, about a tenth of a cent per turn.
- **Extraction today silently fails on longer chats.** The Worker allows 500 output tokens. On 12 of the 116 test chats gpt-4.1-mini's JSON was cut off and nothing was offered. Raising the cap costs nothing on short chats, because only tokens actually produced are billed; it only lets long chats finish.
- **Extraction today over proposes.** Production and gpt-4.1-mini both extract Gremly's own suggestions as if the user had committed to them, and offer same day plans the chat itself is arranging. Gemini follows the prompt's "clear commitment" rule; Luna partly.
- **Personalisation is the noisiest signal** and every model misses it often (Gemini says "light" where the labellers say "deep"). It only changes an instruction in the prompt, so it was left out of the headline. Worth a look when the prompt is next revised.

## 4. Recommendation

1. **Chat model:** Gemini 3.8 Flash, low thinking, after the chat corpus gate (tone, long context). Not tested here.
2. **Triage:** one call on Gemini 3.8 Flash that returns mode, depth, search, personal and the loading line, replacing the three calls. Set with `MODEL_TRIAGE_MODE`, `MODEL_TRIAGE_SIGNALS`, `MODEL_LOADING_MESSAGE` (or `HELPER_MODEL`) once the Worker's helper call sites can talk to Gemini (see 5).
3. **Extraction:** Gemini 3.8 Flash with today's prompt, output cap raised to 2,000 (thinking tokens count against it on Gemini) and JSON mode on. Skip extraction on turns triage marks chit_chat, playful, app_help, venting, emotional or celebration: the pill should not appear during those, and it halves the calls.
4. **Fallback:** GPT-6 Luna, effort none, as the backup when Gemini is slow or down, as the Mind Drop classifier already does.
5. **Worker change needed first:** the 13 helper call sites are direct OpenAI requests. `models.js` makes the model configurable but not the provider. Route them through `aiProvider` so a Gemini model id works, keeping the OpenAI request shape byte for byte for OpenAI models.
6. **Cost:** about 1.4 cents per chat turn all in (chat about 1 cent, helpers about 0.3 cents, summaries about 0.1 cent), roughly 2.8 cents after Google's promotional price ends on 31 Dec 2026. At 100 active users doing 50 turns a month that is about $70 a month, $140 after January.

## 5. Next round (not done here)

- Fold triage into the main reply call: Gemini decides mode, depth and search itself in a small header before the reply text. Removes the pre reply call entirely (about 1.5s sooner to first token) at the cost of a longer main prompt and a bigger corpus gate. Worth testing because the same model that scored 84% here would be doing the deciding.
- Running summary and full chat summary were not scored (no right answer to score against). Spot check them on the winner in the corpus gate.
- Rerun with the 300 reserved turns before the January price decision, alongside Luna, if cost starts to matter.

## 6. Round 2: can the cheaper model be made good enough?

Two prompt variants, written as semantic rules with no examples (`scripts/chat-audit/prompts/variants.mjs`), tuned on nothing and run first on the practice set. The Worker's prompts were not changed.

**Triage rules v2** (the clarifications from the adjudication: a request to produce a list or plan is action_ready; complaints about Gremly are app_help; required search only when the reply names specific places, products or substances). On the 200 practice turns it lifted gpt-4.1-mini by 2.5 points and GPT-6 Luna with low reasoning by 3.5, left Luna at effort none unchanged, and cost Gemini 4 points (81% to 77%). Not adopted: it helps the weaker models a little and hurts the best one, the same lesson as the Mind Drop audit. The policy calls stay in the gold answers, not the prompt.

**Extraction evidence rule v2**: every item must carry the user's own words that show the commitment, copied from a User line, and the code drops any item whose evidence is not found in a user message. Practice set first, then frozen (`results/FREEZE-r2-extraction-v2.txt`) and run once on the 116 locked chats:

| Setup | Items offered | Right (of 34) | Wrong offers | Missed | Chats with a wrong offer | Cost per 1,000 |
|---|---|---|---|---|---|---|
| gpt-4.1-mini, today's prompt | 173 | 24 | 115 | 10 | 61 (53%) | $0.86 |
| gpt-4.1-mini, evidence rule | 56 | 21 | 16 | 13 | 14 (12%) | $0.86 |
| GPT-6 Luna, today's prompt | 77 | 28 | 27 | 6 | 15 (13%) | $0.18 |
| **GPT-6 Luna, evidence rule** | 51 | **29** | **7** | 5 | **7 (6%)** | **$0.19** |
| Gemini 3.8 Flash, today's prompt | 40 | 29 | 1 | 5 | 1 (1%) | $1.53 |
| Gemini 3.8 Flash, evidence rule | 34 | 25 | 1 | 9 | 1 (1%) | $1.63 |

Luna with the evidence rule finds as many right items as Gemini and makes seven wrong offers in 116 chats against Gemini's one, at an eighth of the cost. The seven are grey: notes of facts the user stated (a name change, a travel route) and events they mentioned in passing (a sister's visit, a partner's new job). Gemini with the evidence rule loses recall, so if Gemini runs extraction it keeps today's prompt.

## 7. The split, after round 2

Chat reply on Gemini 3.8 Flash (corpus gate pending). Triage as one Luna call, effort none, with "required" treated as attach the tool and let the reply model decide, which removes Luna's forced search mistakes. Extraction on Luna with the evidence rule, output cap 2,000, JSON mode, gated by triage so it runs only on turns that could hold something to save; Gemini stays available for extraction by flipping one var if the wrong offer rate in production is not acceptable. Summaries on Luna. Gemini and Luna are each other's fallback. About one and a half Gemini calls per turn instead of three or four, which keeps the daily cap far away, and helpers at about a twentieth of a cent per turn. The chat call is the cost that matters; `[USAGE]` logs now measure it in production.
