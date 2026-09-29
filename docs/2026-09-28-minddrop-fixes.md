# Mind Drop fixes, 28 to 29 Sep 2026

Branch: `minddrop-fixes-9.28` (from `app-fixes-6.23`). Committed on this branch. Nothing is deployed yet.

## 1. TestFlight stopped working

TestFlight builds expire 90 days after upload. The last Cortex deploy was 9 Jun, so a build from then expired around early September. Nothing is broken; it needs a fresh build. Expo SDK 54 already meets Apple's Xcode 26 rule.

`eas.json` now gives the preview and production profiles an EAS Update channel, so after this build you can push JS only fixes to testers with `eas update --channel production` instead of a new TestFlight build each time. Builds still expire at 90 days.

Steps (on your Mac, in the repo):

1. Review the pull request for this branch and merge it where you build from (EAS builds from git).
2. `npx eas-cli@latest env:list --environment production` and check EXPO_PUBLIC_CORTEX_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY and EXPO_PUBLIC_REVENUECAT_API_KEY are there. They are not in eas.json and `.env.local` is not uploaded.
3. Deploy the Workers first (section 5), then `npx eas-cli@latest build --platform ios --profile production --auto-submit`.
4. In App Store Connect, TestFlight, add the new build to your tester group. Internal testers get it straight away; the first build for external testers may need a short Beta App Review.
5. If submit says the version must be higher than an approved one, bump `version` in app.json to 1.0.1.

## 2. The clarification stall

Evidence from Supabase: 524 notes have been flagged "needs clarification". Since May, 0 of 20 got options (every one stalled). In March and April it was about 90%. Only 29 were ever resolved.

Causes found, all fixed:

1. Phase 1 flagged drops ambiguous with no ambiguity type (any confidence under 0.7 counted as ambiguous, with no type). The app only asks when there is a type, so it never asked, and the card sat on "Thinking..." forever.
2. Clarification was fire and forget. If it came back after the drop had synced and left the queue, `updateDrop()` quietly did nothing, so the fallback that should have written to the saved item never ran.
3. Any error, timeout or short options list was ignored, with no retry and no fallback.
4. The "Thinking..." popup had no way out: no close button, no tap outside, no back button.
5. The Worker's fallback model calls had no timeout, so a slow provider could hold a request open indefinitely.

What happens now:

- Clarification is fetched inside the pipeline, in parallel with the title call, before sync, with an 8 second cap. It always ends with a question and options: the Worker's, or fixed copy for that type.
- With the one call classifier (section 4), the question and options come back in the classification response itself, so there is no second call.
- Items saved without options heal themselves: opening the popup, the overlay or reaching them in Sweep fetches options and saves them. That covers the old stuck notes.
- The loading popup can always be closed.
- Worker: ambiguous results always carry a type, and every fallback call has a deadline.

Tests: `lib/minddrop/__tests__/clarification.test.ts` (new) and new cases in `dropPhases.test.ts`.

## 3. Better questions

The old fixed questions ("Is this already in the diary?", "What do you want to do with Hello?") are gone. Every question is now written for the actual drop: it has to name what the drop is about, and the answers have to be natural replies to it. The Worker then checks it in code: about 12 words at most, no app words such as todo, habit, note or track (unless the user wrote that word themselves), no dashes. A label that fails is swapped for the fixed label of that option on its own, so the good labels are kept.

Round 2 split the job in two. The classifier decides whether to ask and which kind of question, which fixes what each answer does; Claude Sonnet then writes the words. Rated blind on the new drops by two judges from different companies, Sonnet's questions averaged 3.6 and 4.5 out of 5, against 3.1 and 4.1 for the classifier's own words; today's questions averaged 2.5 and 2.9 in round 1. If Sonnet is slow or its words fail the checks, the classifier's words are used.

One flaw fixed: for vague wishes ("be less stressed"), the "just holding the thought" answer filed the drop as a reference note, when users mean a journal entry. It now files as a journal entry, and the answers offered now include what the user meant in about 9 of 10 questions, up from about half. Details in section 5 of the audit.

Your note in item 2 was cut off at "we should add a". Tell me what it was and I will add it.

## 4. Speed and accuracy

Full audit: `docs/2026-09-29-minddrop-model-audit.md`. Short version, on 1,000 new random drops never used to tune anything:

- Today: 87.8% accurate, 111 drops filed wrong without asking, 1.4s typical and 2.9s at the slow end, $1.66 per 1,000 drops.
- Recommended, Gemini 3.8 Flash in one call with Sonnet writing the questions and GPT-6 Luna as backup, run through the real Worker route: 97.5% accurate, 16 filed wrong without asking, 1.2s typical and 2.8s at the slow end, $2.24 per 1,000 drops (about $4.40 from January).
- GPT-6 Luna on its own: 94.2% to 95.1% accurate, $0.15 per 1,000 drops. Adding Gemini 3.8 as a second opinion when Luna wants to ask came in at 95.6% with 40 filed wrong without asking, so it is not recommended for now.

Round 2 also tested whole designs: a checklist with rules enforced in code, a fast first model handing hard drops to specialists, and two models in parallel with a referee. None beat one call to Gemini 3.8 with the current prompt.

The one call classifier is now switched on in config: `workers/cortex/wrangler.toml` sets the recommended setup, and `eas.json` turns it on in every build profile. It goes live with the next Worker deploy and app build; section 8 of the audit has the steps. Changing model later is only a Worker var change. If a one call classification ever fails, the app falls back to the v2 chain for that drop, and `CLASSIFY_V3_ENABLED = "false"` turns it off for everyone without a new build.

## 5. Urgent: gpt-4.1-nano is switched off on 23 Oct 2026

OpenAI announced on 22 Apr that gpt-4.1-nano leaves the API on 23 Oct. Cortex used it for the 7 preparse calls, detect-multi, chat triage, greetings, entity chat, sweep headlines, chat summaries and default chat; the Inngest worker used it for space matching. After 23 Oct all of that would fail or fall over to slower backups.

Fixed: every use now goes to gpt-4.1-mini (same request shape), model names sent by older app builds are remapped in the Worker, and every tier can be changed with a Worker var (`NANO_MODEL`, `MINI_MODEL`, `CLASSIFY_MODEL`, and so on). gpt-4.1-mini more than doubles the cost of the v2 chain; `NANO_MODEL = "gpt-6-luna"` keeps today's cost but is about half a second slower. Moving Mind Drop to the one call classifier avoids the question.

Correction to the first version of this note: `gemini-3.1-flash-lite-preview` was not shut down in May; it still answers. The Haiku tier fallback now points at the non-preview `gemini-3.1-flash-lite`, which is right either way.

This needs a Worker deploy before 23 Oct even if nothing else ships:

```
cd workers/cortex && npx wrangler deploy
cd ../inngest-jobs && npx wrangler deploy
```

## Also fixed

- classify-phase1-v2 made a pointless self fetch (a whole extra classification whose result was thrown away) every time preparse failed. Removed.
- Worker model calls: Claude 5.x models reject `temperature` and think by default; OpenAI reasoning models need `max_completion_tokens` and a reasoning setting; Gemini 3.8 Flash rejects the "minimal" thinking level. The adapters handle all three, Gemini JSON calls now use JSON mode, and the one call classifier hedges: if the main model has not answered in 3 seconds, the backup starts too and the first valid answer wins.
- Gemini has a daily cap of 10,000 requests per model on your current tier (the audit hit it). Past it, the Worker's backup model takes over, so drops keep working.

## Checks run

- Worker unit tests: all pass, including tests for every prompt version's rules, the outcome format, the habit gate, the journal fix, label handling and hedging.
- App: type check clean; the full Jest suite passed in 16 shards on 28 Sep, and the Mind Drop tests were re-run after the latest changes.
- Both round 2 finalists were run end to end through the real Worker route on the 1,000 new drops, with backup, hedging, second opinion and question writer. No drop failed, and all finished inside the app's 10 second budget.

## Not done, worth knowing

- Old app builds keep using the old chain until testers install the new build, but they still get the Worker fixes (better questions, typed ambiguity, timeouts, nano remap).
- `scripts/minddrop-audit/data/` and `scripts/minddrop-audit/round2/data/` hold real beta drops. Keep the repo private.
- Security: `lib/env.ts` reads `EXPO_PUBLIC_OPENAI_API_KEY`. Anything prefixed EXPO_PUBLIC_ is baked into the app binary, so if that variable is set in your EAS environment, your OpenAI key ships inside the app where anyone can pull it out. Nothing in the app uses it any more. Check `eas env:list`, remove it if it is there, and rotate the key.
- The Supabase project "Gremly Mobile" (the older one) is paused. The app uses "Gremly-mob2".
