# Mind Drop model audit, 29 Sep 2026

Which model and which design should classify Mind Drops, tested on 1,000 new, randomly drawn real drops that nobody picked and nothing was tuned on. The recommended setup is now set in the repo (`workers/cortex/wrangler.toml` and `eas.json`). It goes live when the Worker is deployed and a new app build ships (section 8).

## 1. Short answer

On 1,000 new random drops:

| Setup | Accuracy | Filed wrong without asking | Needless questions | Multi drops found | Pieces right | Typical | Slow end (p90) | Cost per 1,000 drops | Calls per drop |
|---|---|---|---|---|---|---|---|---|---|
| **Today** (v2 chain, gpt-4.1-nano) | 87.8% | 111 | 11 | 32/35 | 66/76 | 1.4s | 2.9s | $1.66 | 9.5 |
| **Recommended:** Gemini 3.8 Flash, Sonnet writes questions, Luna backup (real Worker route) | **97.5%** | **16** | 9 | 34/35 | 74/76 | **1.2s** | **2.8s** | $2.24 | 1.1 |
| Gemini 3.8 Flash, one call (test harness, first run) | 97.7% | 15 | 8 | 34/35 | 74/76 | 1.0s | 1.6s | $2.13 | 1 |
| Gemini 3.8 Flash, checklist version | 97.7% | 19 | 4 | 34/35 | 74/76 | 1.2s | 1.8s | $2.86 | 1 |
| Cost option: Luna, Gemini 3.8 second opinion, Sonnet questions (real Worker route) | 95.6% | 40 | 4 | 32/35 | 70/76 | 1.5s | 3.8s | $0.50 | 1.2 |
| GPT-6 Luna, low reasoning, improved prompt | 95.1% | 22 | 27 | 33/35 | 72/76 | 1.6s | 2.9s | $0.15 | 1 |
| GPT-6 Luna, low reasoning, current prompt | 94.2% | 27 | 31 | 31/35 | 68/76 | 1.7s | 3.2s | $0.14 | 1 |
| Gemini 3.1 Flash-Lite | 91.6% | 47 | 37 | 33/35 | 70/76 | 0.7s | 0.9s | $0.75 | 1 |

**Recommendation: Gemini 3.8 Flash, one call, with Claude Sonnet writing the words of the clarifying questions and GPT-6 Luna as the backup.**

- It is 9.7 points more accurate than today when run through the real Worker route (p < 0.0001). It files 16 drops in 1,000 wrong without asking, where today files 111.
- It gave the same result twice: 97.7% in the test harness and 97.5% end to end through the Worker. 16 drops changed answer between the two runs.
- Most drops take 1.1s (2.1s at the slow end). The 9% that get a question take about 2.8s (4.4s at the slow end), because Sonnet writes the words. Overall it is as fast as today or faster, and no drop took over 7s.
- When Gemini was slow, the Luna backup answered instead on 19 drops, and got 15 of them right.
- It costs about a third more than today until 31 Dec: $2.24 per 1,000 drops including the question wording, against $1.66. Google's promotional price then ends, and it becomes about $4.40 per 1,000. At current volume, about 150 drops a month, that is well under $1 a month either way.
- Gemini 3.8 beats Luna by 2.6 points (p = 0.0001) and Flash-Lite by 6.1 points (p < 0.0001) on the same drops.

**The cheaper option is not recommended for now.** Luna with Gemini 3.8 as a second opinion was estimated at about 96.9%. Run live through the Worker, it came in at 95.6%, with 40 drops filed wrong without asking (section 3). It would save about 25 cents a month at current volume.

## 2. How round 2 was tested

**New drops.** Supabase holds 4,420 unique drop texts from 98 accounts. 82 of those accounts no longer exist in sign in, and many of their drops are scripted test runs replayed in bursts. Rules fixed before looking at any drop:
- exclude empty drops and exact duplicates
- exclude the 450 drops already used, and near duplicates of them
- exclude automated runs, meaning any account hour with more than 20 drops

That left 2,434 drops. Code took the first 1,000 in a fixed pseudo random order. They come from 67 accounts; your account is 30% of them, and 55% come from accounts that still sign in.

**Correct answers.** Three blind labellers used an updated guide with your strict habit rule. They all agreed on 967 of 1,000. You reviewed the 33 they split on and a random 25 they agreed on. You accepted their answer on all 25, so the other 942 can be trusted. Multi drops have every piece labelled, so this round also scores how drops are split.

**Design set and test set.** All tuning happened on the 450 older drops, relabelled the same way. The 1,000 new drops stayed locked until every prompt was frozen (hashes recorded in `scripts/minddrop-audit/round2/FREEZE.txt`). The two finalists were then run end to end through the real Worker route, exactly as the app will call it, with backup, hedging, second opinion and question writer.

**Measures.** As round 1: accuracy against every answer you would accept, silent mistakes, needless questions, time, and cost at Gremly's real traffic. New this round:
- multi pieces: was each piece of a multi drop split out and given the right category
- whether a question's answers include what the user meant

## 3. What was tried

Everything below ran on the 450 drop design set first.

| Design | Design set accuracy | Typical | p90 | Cost per 1,000 | Verdict |
|---|---|---|---|---|---|
| Gemini 3.8 Flash, one call, current prompt | 94.9% | 1.1s | 1.7s | $2.14 | 97.7% on the new drops, 97.5% end to end |
| **1. Checklist + code gates** (Gemini 3.8) | 96.4% | 1.2s | 1.7s | $2.90 | 97.7% on the new drops, same as the current prompt but slower and dearer |
| Improved prompt without the checklist (Gemini 3.8) | 96.2% | 0.9s | 1.6s | $2.35 | 96.6% on the new drops |
| **2. Fast gate + specialists** (Flash-Lite, then Gemini 3.8 for habits, multi drops and questions) | 95.3% | 1.0s | 2.4s | $1.79 | The fast first step lets wrong answers through without asking |
| Fast gate, then Gemini 3.8 on the risky third (no specialist prompts) | 95.1% | 1.0s | 2.6s | $1.97 | Same problem |
| **3. Two opinions + referee** (Luna and Flash-Lite, Gemini 3.8 on disagreement) | 96.7% | 2.8s | 4.8s | $1.57 | Accurate but slow |
| Luna, Gemini 3.8 second opinion when it wants to ask | 96.0% to 96.9% | 1.5s | 3.7s | $0.42 | 95.6% on the new drops, 40 silent mistakes |
| Luna on its own | 94.0% to 94.9% | 1.5s | 2.8s | $0.15 | 94.2% to 95.1% on the new drops |
| Gemini 3.8 thinking more (medium) | 96.0% | 2.1s | 5.4s | $4.53 | No gain, slower |
| Flash-Lite, any prompt | 90.7% to 92.4% | 0.7s | 0.9s | $0.75 | Fastest, least accurate |

What this taught us:

- **Your rules work best stated plainly in the prompt.** The code gates changed almost nothing, because the models follow the habit rule once it is written down.
  - The first gate was wrong for stop habits: "stop smoking" is ongoing by nature and doesn't need a stated frequency. The fixed gate is in the Worker, used only with the checklist version.
- **Prompt tweaks that looked good on the design set did not carry over.** The extra decision steps and rules added about 1.5 points on the design set. On the new drops they cost Gemini 3.8 a point (p = 0.03) and gained Luna a point (not significant). The design set had shaped those tweaks, which is exactly why the locked test set exists. The Worker keeps the audited prompt as the default (now v3.7, which adds only the rules in sections 12 and 13); the other versions can be switched on (`CLASSIFY_PROMPT`).
- **Sequential gates lose to one strong call.** A cheap first step decides most drops on its own, and its mistakes are silent. Every design that let Flash-Lite answer on its own filed more drops wrong without asking.
- **Parallel opinions are accurate but slow.** Luna gets slow with longer prompts, and a referee adds a second hop.
- **Luna's weakness is asking too often, and a second opinion only half fixes it.** On the new drops, the second opinion cut Luna's needless questions from 27 to 4, but the live run filed 40 drops wrong without asking, against 16 for the recommended setup. Two causes:
  - When Luna is slow, the Flash-Lite backup wins the race; it got 6 of those 19 drops wrong.
  - The second opinion files some drops that do deserve a question (7 of 88).
  - Drops that get a question are also slow in this setup, about 5.5s typical, because three models run one after another.
  Using Gemini 3.8 as the backup would help the first point. Anything beyond that would mean tuning on the test set, so it is left for a fresh test set if volume ever makes the saving matter.
- **Gemini has a daily cap.** Your Gemini project allows 10,000 requests a day per model, and the audit hit it for Gemini 3.8 Flash. It reset at midnight Pacific time, and the finalists were then rerun end to end (section 6).

## 4. Multi drops

- **Today:** finds 32 of 35 multi drops, 66 of 76 pieces right.
- **Gemini 3.8 in one call:** finds 34 of 35, 74 of 76 pieces right, in both runs.
- **Things that did not help:**
  - A separate multi specialist added a piece or two on the design set, not worth a second call.
  - Classifying each piece on its own, as today does, did no better than classifying it with the whole drop in view.
- **Flash-Lite and Luna** split more drops that should stay whole (8 wrong splits on the new drops for Luna).

## 5. Clarifying questions

**A flaw fixed.** When the question was about a vague wish ("be less stressed", "stop overthinking"), the "just holding the thought" answer filed the drop as a reference note. The labellers, and your own answers last round, say those are journal entries. So only about half the questions offered the answer the user meant. That answer now files as a journal entry, for both vague wishes and "only noting the intention". With it, the answers cover what the user meant in about 9 of 10 justified questions on the new drops, for every model. It is a code change the model never sees.

**Who decides, who writes.** Gemini 3.8 in one call is best at deciding whether to ask and which kind of question: it asks 8 or 9 needless questions in 1,000, against 27 for Luna. For the words, Claude Sonnet was clearly best. On the new drops, both judges rated Sonnet's wording above Gemini's own, for the same drops and the same kind of question:
- Anthropic judge: 3.6 against 3.1 out of 5
- Google judge: 4.5 against 4.1 out of 5
- share rated good: 60% against 28%, and 96% against 80%
- zero app words, where 8 of Gemini's questions had to fall back to fixed copy

In the end to end run, Sonnet wrote the words for all 90 drops that got a question (on one, its question failed the checks and fixed copy was used with its answers). It costs about $0.001 a question and adds about 1.5s to those drops only.

## 6. Cost, limits and caching

| Volume per month | Today | Recommended (2026 / 2027) | Cost option |
|---|---|---|---|
| 150 drops | $0.25 | $0.34 / $0.66 | $0.07 |
| 10,000 drops | $17 | $22 / $44 | $5 |
| 100,000 drops | $166 | $224 / $441 | $50 |

- **Gemini daily cap.** 10,000 requests a day per model on your current Gemini tier, reset at midnight Pacific time. Past that, calls fail and the Worker falls back to the backup model (Luna), so drops still work. Google raises caps as spend grows. Check the tier in Google AI Studio under rate limits.
- **OpenAI limits.** Tier 1: 500 requests and 200,000 tokens a minute per model. Adding about $50 of credit should move you to Tier 2. With one call per drop, Tier 1 is fine for now.
- **Caching.** Gemini only caches prompts of 4,096 tokens or more, and ours is about 2,400, so there is none; the numbers above assume none. Luna's prompt is cached.

## 7. What changed in the code

- `workers/cortex/classifyV3.js`:
  - prompt versions v3.7 (default; v3.5 plus the rules in sections 12 and 13), v4.1 and v4 (checklist), chosen with `CLASSIFY_PROMPT`
  - the fixed habit gate, applied only when the checklist version is used
  - the second opinion prompt
  - the journal fix for "holding the thought" answers
- `workers/cortex/aiProvider.js`:
  - new tiers `clarify_writer` (Sonnet by default when an Anthropic key is set) and `second_opinion` (off unless `SECOND_OPINION_MODEL` is set)
  - hedged backup: if the main model has not answered in 3s, the backup starts too and the first valid answer wins
  - Gemini JSON mode, and a retry at "low" when a Gemini model rejects a thinking level
- `workers/cortex/cortex-index.js`:
  - `classify-v3` runs the optional second opinion, then the question writer
  - both only start if there is time left, with deadlines cut to fit, so the whole route ends within 9s, inside the app's 10s budget
  - if either is slow or fails, the answer so far stands
  - `clarify-ambiguity` uses the writer too
- **Tests:** unit tests for prompt rules (no examples, no word lists, no dashes, every version), the gate, the journal fix, label handling and hedging.

## 8. Switching it on

1. Deploy both Workers (needed before 23 Oct regardless, for the gpt-4.1-nano shutdown).
2. `npx wrangler secret list` in `workers/cortex` should show `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and `ANTHROPIC_API_KEY`. Without the Anthropic key, questions keep the classifier's own words.
3. The Worker vars for the recommended setup are in `workers/cortex/wrangler.toml`, so the deploy in step 1 applies them. They are the exact config run end to end:
   ```
   CLASSIFY_V3_ENABLED = "true"
   CLASSIFY_PROVIDER = "gemini"
   CLASSIFY_MODEL = "gemini-3.8-flash"
   CLASSIFY_THINKING_LEVEL = "low"
   CLASSIFY_FALLBACK_PROVIDER = "openai"
   CLASSIFY_FALLBACK_MODEL = "gpt-6-luna"
   ```
   The cost option, as run end to end (not recommended for now, see section 3):
   ```
   CLASSIFY_V3_ENABLED = "true"
   CLASSIFY_PROVIDER = "openai"
   CLASSIFY_MODEL = "gpt-6-luna"
   CLASSIFY_REASONING_EFFORT = "low"
   CLASSIFY_PROMPT = "v4.1"
   SECOND_OPINION_PROVIDER = "gemini"
   SECOND_OPINION_MODEL = "gemini-3.8-flash"
   CLASSIFY_FALLBACK_PROVIDER = "gemini"
   CLASSIFY_FALLBACK_MODEL = "gemini-3.1-flash-lite"
   ```
4. `eas.json` sets `EXPO_PUBLIC_CLASSIFY_V3=on` for every build profile, so the next build uses it. Add it to `.env.local` to use it in local dev. A failed one call classification falls back to the v2 chain for that drop, and `CLASSIFY_V3_ENABLED = "false"` turns it off for everyone without a new build.

## 9. Round 1, in brief

Round 1 (earlier today) screened 12 models on 200 practice drops and scored the best on 250 locked drops. Gemini 3.8 Flash and GPT-6 Luna came out on top then too, and the prompt that round produced is the one recommended above. Round 2 exists because 250 test drops were too few, multi drops and questions were not scored properly, and the designs were one dimensional. The round 1 harness and results are in `scripts/minddrop-audit`, round 2 in `scripts/minddrop-audit/round2`.

## 10. Limits of this audit

- 1,000 test drops give each accuracy figure a margin of about 1.5 points. Differences are reported as paired comparisons on the same drops.
- The recommended setup ran twice on the new drops (harness and real Worker); the other setups ran once. On the design set, repeat runs changed only a handful of answers.
- The drops lean towards your own writing (30% are yours).
- Question ratings come from two models from different companies, not from users.
- Audit spend: about $48 in logged model calls (including the section 12 and 13 checks), roughly $52 including runs that were stopped or redone, of the $60 cap.

## 11. Before January

Google's promotional price ends on 31 Dec, roughly doubling the cost per drop. Every eligible drop up to 29 Sep has now been used (the last 1,420 for the section 12 check, in `scripts/minddrop-audit/data/fresh.json`), so the December check needs drops made after that date. In early December:
- Rerun `round2/run-design.mjs` on whatever cheaper models exist then, against the same 1,000 drops and a fresh batch of new ones.
- Greetings, test messages and questions for Gremly are now handled (section 12). Still to test on fresh drops: app feedback ("the app should...") as a to-do.
- Test a code rule that merges multi pieces when every piece is a journal entry.

Of the 16 drops the recommended setup got wrong without asking, 4 look like prompt gaps, 5 are Gemini's own habits, 3 are harmless splits, 3 have debatable answers and 1 is run to run noise. Switching model is only a Worker var change, so no app build is needed.

## 12. After the audit: questions that open the chat

Gemini 3.8 filed greetings, test messages and questions for Gremly as journal entries. Now two kinds of drop always get a question whose answers can open the chat (prompt v3.6, principle 11):
- **Addressed to Gremly** (it greets Gremly, checks the app works, or asks Gremly to talk or help now): "Chat with Gremly", "Just testing, don't keep it", "Keep it".
- **A question the user wants answered:** "Ask Gremly now", "Look into it later", "Keep it".

The answers are fixed copy, and only the question is written for the drop. Chat opens Ask Gremly and sends the drop so Gremly replies straight away; the drop leaves Mind Drop.

**How it was checked.** The rule was written after reading the test set's mistakes, so the test set cannot prove it. It was run end to end through the Worker on the 1,420 eligible drops nobody had used (all that were left in Supabase), and on the 1,000 test drops for side effects.
- **Test drops:** 97.2% against 97.5% for the audited prompt, which is within run to run noise (p = 0.66). 13 filed wrong without asking against 16; 15 needless questions against 9. It caught "Hi", "Hello", "Hello Gremly", "Is this working?", "What should I do now?" and "What are good supplements for focus?".
- **Fresh drops:** it fired on 7 of 1,420. The good catches included "Good morning Gremly", "I can't wait for tomorrow but I am so tired. Help me" and "How do I make fix search console issues". Three were notes about building or fixing the app, and one more of those turned up in the test set.
- **Fix:** a clause saying a note about building, changing or fixing the app is a note to self. Rerun on the 428 app, question and greeting drops from both sets, plus 250 random test drops: all four app notes now file normally, and every good catch stayed. On the 414 test drops in that run it got 404 right, against 403 for the audited prompt, with 6 filed wrong without asking against 9. The prompt in the Worker is the exact one tested.
- **Left as is:** "Where has lock in option gone from overlay?" still gets the question. From a user who is not building the app, that is a question for Gremly.

## 13. After the audit: appointments with no date

"Doctors appointment" used to get the generic question, whose answers ("I need to book it", "Thinking about booking one", "Just noting it down") had no way to say it was already booked. Now an appointment, booking or reservation with no date asks whether it is booked (prompt v3.7, a line in principle 5): "It's booked", "I need to book it" or "Just a note", worded by the model for the drop. After "It's booked", the popup asks **When is it?**: today, tomorrow or any date, and an optional time. The date and time are saved on the event, so it shows on Today. "I'll add it later" files it without a date. A drop that already has a date keeps the existing "Is this booked already?" question.

**How it was checked.** Every unused drop had already been used for section 12, so this reused the two sets: all 197 drops that mention an appointment, booking, a service or similar, from the test set and the fresh drops, plus the same 250 random test drops as before, run end to end through the Worker.
- It asked the new question for "Blood test", "Hairdressers", "chiropractor" and "Nails appointment", which the labellers all marked as needing a question and which had all been getting the generic one. It also works for "Doctors appointment", "Dentist", "Haircut", "Vet appointment for Max" and "Dinner reservation"; "Book dentist" stays a to-do and "Doctors appointment Tuesday" keeps the date question.
- On the 307 test drops in the run: 303 right against 300 before, 2 filed wrong without asking against 3, and 2 needless questions against 4. Nothing else changed beyond run to run noise.
- The prompt in the Worker is the exact one tested.

