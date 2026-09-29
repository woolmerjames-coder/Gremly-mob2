# classify-v3: the one call Mind Drop classifier

One model call returns everything the app needs for a drop: what it is, whether it is several items (and the split), and, when it is unclear, the question and one tap answers. It replaces the v2 chain (detect-multi, 7 preparse calls, optional Phase 1, clarify-ambiguity), which makes about 9 calls per drop.

Which model and design it runs on was decided by the audit in `docs/2026-09-29-minddrop-model-audit.md`. It is switched on in `workers/cortex/wrangler.toml` (Gemini 3.8 Flash, GPT-6 Luna backup) and in every `eas.json` build profile, and goes live with the next Worker deploy and app build.

## Where the code is

- `workers/cortex/classifyV3.js`: the prompts, the fixed answer options for each kind of question, the habit gate and the checks on the model's output. Pure module, used by the Worker and by the audit harness, so both run identical logic.
- `workers/cortex/cortex-index.js`, route `classify-v3`: calls the model through `aiClassify` with the `classify` tier, then the optional second opinion and the question writer.
- `workers/cortex/aiProvider.js`: tiers `classify`, `second_opinion` and `clarify_writer`, all set by Worker vars.
- App: `lib/minddrop/phase1.ts` (`runClassifyV3`) and `lib/minddrop/dropPhases.ts` (`handleQueued`), behind `FEATURE_FLAGS.CLASSIFY_V3_ENABLED` (`EXPO_PUBLIC_CLASSIFY_V3=on`).

## The prompt

- Semantic definitions only: no example drops, no example answers, no lists of words to look for, no dashes. `workers/cortex/__tests__/classifyV3.test.js` fails if any of that creeps in, for every prompt version.
- Fully static, so providers can cache it across users. Today's date and whether the user picked a date go in the user message.
- The model returns one outcome: todo, start_habit, break_habit, journal, idea, event, general or ambiguous.
- Habits are a strict outcome: only a concrete behaviour the user could log in Gremly each time. A habit to start needs the drop itself to make the repetition clear; a habit to stop does not, because stopping is ongoing by nature.
- When the outcome is ambiguous, the model picks one of thirteen kinds of question and writes the question and the answer labels. What each answer does is fixed in code for that kind of question; the model only writes the words, plus whether a habit option is one to build or to cut back.
- Two kinds of drop always get a question whose answers can open the chat (principle 11):
  - `conversation`: the drop is addressed to Gremly rather than capturing something (it greets Gremly, checks the app works, or asks Gremly to talk or help now). Answers: "Chat with Gremly", "Just testing, don't keep it", "Keep it".
  - `open_question`: a question the user wants answered. Answers: "Ask Gremly now", "Look into it later" (a todo), "Keep it".
  - A note about something to build, change or fix in the app is a note to self like any other, not a drop addressed to Gremly.
  - These answers are fixed copy (`fixedLabels`); only the question is written for the drop.
- An appointment, booking or reservation with no date ("Doctors appointment") asks whether it is booked (`booking`): "It's booked" (an event), "I need to book it" (a todo) or "Just a note". The model writes these words. After "It's booked", the popup asks **When is it?** (today, tomorrow or any date, and an optional time) and saves the date and time on the event; "I'll add it later" files it without one. With a date already in the drop, the existing "Is this booked already?" question (`date_type`) is used instead.

Three versions, chosen with `CLASSIFY_PROMPT`:

| Version | What it is | Use |
|---|---|---|
| `v3.7` | The audited v3.5 prompt plus principle 11 (v3.6) and the booking question (v3.7) above. | Default. |
| `v4.1` | The default plus ordered decision steps and more principles. | Better on the design set only; did not carry over to new drops. |
| `v4` | v4.1 plus a facts checklist the model fills before deciding (is a repetition stated, is there a concrete action, is it one occasion, and so on). | Same accuracy as v3.5 on new drops, slower and dearer. Turns on the habit gate below. |

Older names (`v3.5`, `v3.6`) run the default, so an old value of the var still works.

The second opinion uses its own prompt (`buildSecondOpinionPrompt`), built from v4, whose job is to decide whether a question is really needed.

## Checks in code (never sent to the model)

- The outcome must be one of the defined values; a bucket that names a subtype directly is read as that subtype.
- Habit gate (`gateHabit`), only when the model returned the v4 facts checklist and the drop is not multi. A habit to start needs a stated repetition, a concrete action and not a one off occasion; a habit to stop needs a concrete action and not a one off. If a habit fails: a feeling being processed becomes a journal entry; a concrete action becomes a todo (or the habit or todo question, if the user sounds unsure whether to act); anything else gets the vague wish question.
- The question must be about 12 words at most and free of app words (todo, habit, note, track and similar), unless the user wrote that word in the drop. Otherwise the fixed question for that kind is used.
- Each label must be short and free of app words. A label that fails is swapped for its fixed label on its own; if the count is wrong, the whole fixed set is used.
- For vague wishes and "only noting the intention", the "just holding the thought" answer files the drop as a journal entry (it used to file it as a reference note, which is not what users meant).
- Dashes are replaced.
- Answers with a `kind` do not file the drop. In the app, `chat` opens Ask Gremly and sends the drop as the first message, then removes it from Mind Drop; `discard` deletes it (`resolveEntityClarification` in `lib/store/useGremlyStore.ts`, the `minddrop:open_chat` event in `App.tsx`). Each such answer still has a bucket, so anything that ignores the kind files the drop as a note.
- An answer with `followUp: 'when'` makes the popup ask when it is before filing (`ClarificationPopup`); the chosen date and time replace any the Worker read from the text (`resolveEntityClarification`).
- The app's fixed copy (`lib/minddrop/clarification.ts`) must file every answer exactly as the Worker does, including `kind` and `followUp`; `lib/minddrop/__tests__/clarification.test.ts` checks this.

## After the classifier

1. **Second opinion** (off unless `SECOND_OPINION_MODEL` is set). Only when the classifier wants to ask. A stronger model looks at the drop again and either files it or confirms the question. Meant for a cheap classifier such as Luna, which asks too often.
2. **Question writer** (on by default when `ANTHROPIC_API_KEY` is set). Only when the answer is still a question. The classifier has already chosen the kind of question, so the answers and what they do are fixed; Claude Sonnet writes the words. If it is slow, or its words fail the checks above, the classifier's own words stay. `CLARIFY_WRITER_ENABLED = "false"` turns it off. The standalone `clarify-ambiguity` route uses the same writer.

## Timing and backup

The main model gets 5 seconds. If it has not answered after 3 seconds (`CLASSIFY_HEDGE_MS`), the backup model starts too and the first valid answer wins. The backup gets 4 seconds.

The whole route stays within 9 seconds, inside the app's 10 second budget for the call. The second opinion (up to 3s, backup 2.5s) only starts if at least 2s are left, and the writer (up to 2.5s, backup 1.5s) only if at least 1.5s are left; both deadlines are cut to fit what is left. If either step is skipped, slow or fails, the answer so far stands. If the whole call fails, the app falls back to the v2 chain for that drop.

## Worker vars

| Var | Meaning |
|---|---|
| `CLASSIFY_V3_ENABLED` | `"true"` to serve the route. Anything else returns 503, and the app uses v2. |
| `CLASSIFY_PROVIDER`, `CLASSIFY_MODEL` | Main model. Default until one is picked: OpenAI `gpt-4.1-mini`. |
| `CLASSIFY_PROMPT` | `v3.7` (default), `v4.1` or `v4`. |
| `CLASSIFY_REASONING_EFFORT` | OpenAI reasoning models, for example `low` for GPT-6 Luna. |
| `CLASSIFY_THINKING_LEVEL` | Gemini, for example `low` for Gemini 3.8 Flash (it rejects `minimal`). |
| `CLASSIFY_FALLBACK_PROVIDER`, `CLASSIFY_FALLBACK_MODEL` | Backup model. Use a different provider from the main one. |
| `CLASSIFY_MAX_OUTPUT_TOKENS` | Default 1500. Thinking counts towards it on Gemini and OpenAI reasoning models. |
| `CLASSIFY_HEDGE_MS` | When the backup starts, default 3000. |
| `SECOND_OPINION_PROVIDER`, `SECOND_OPINION_MODEL` | Second opinion model. Off unless the model is set. Provider defaults to `gemini`. |
| `SECOND_OPINION_THINKING_LEVEL` | Gemini thinking level for the second opinion, default `low`. |
| `CLARIFY_WRITER_PROVIDER`, `CLARIFY_WRITER_MODEL` | Question writer. Default Anthropic `claude-sonnet-5-5` when `ANTHROPIC_API_KEY` is set, otherwise the Mini tier model. |
| `CLARIFY_WRITER_ENABLED` | `"false"` to keep the classifier's own question words. |

The response and the `[ClassifyV3]` log line include `prompt_version`, `gate` (when the habit gate changed the answer), `second_opinion` and `writer`, so you can see in the logs what each step did.

The setups from the audit are in its section 8.

## Changing the prompt

Use the harness in `scripts/minddrop-audit/` (and `round2/` for whole designs): change the prompt, run the design set on the chosen model and a cheap one, read the misses, and only run the locked test set once the prompt is final. Bump `PROMPT_VERSION` in `classifyV3.js` (or add a version to `PROMPT_VERSIONS`) with every change. Round 2 showed why the locked set matters: prompt changes that added 1.5 points on the design set added nothing on new drops.
