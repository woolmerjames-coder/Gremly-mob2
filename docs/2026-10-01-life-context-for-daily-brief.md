# Life context work: what exists for the Daily brief in Chat project

Written 1 Oct 2026 at the end of the life context project (branch `lifemaps-context-fixes-9.30`). It lists what that project built that the brief may be able to use. It is a description of what is there, not a plan: the brief project decides what to use.

The brief plan's "What the DCO needs to carry" list is mapped at the end.

## The DCO (v4)

Row: `user_daily_state.dco`, one per person per local day, `pipeline: 'dco-v4'`.

- **When it is built:** the hourly dispatcher sends `app/dco.generate-user` from 4am local time, once per local day, for people active in the last 30 days (`get_users_for_dco`). Built by `buildDcoV4` in `workers/inngest-jobs/context/daily.js`. If v4 fails, the old v3 DCO is written that day instead (the run output has `v4_fallback`).
- **How it is written:** Gemini 3.8 Flash writes it. A GPT-6 Luna check reads the draft against the same inputs. If the check finds problems, it is written once more with those problems named, and any field still failing is cleared. `review_flags` on the row lists anything the check raised.
- **Fields in `dco.brief`:**
  - `headline`: the notification line, up to 90 characters.
  - `day_shape`: one sentence on how full the day is.
  - `claims`: things with a real claim on today, each `{type, id, title, why}`. The id points at a real row (todo, habit, calendar entry, fact). Unknown refs are dropped in code.
  - `reach`: at most one undated item, `{type, id, title, why, facts: [{id, statement}]}`. Only present when a ledger fact gives a reason for today, and never from a private fact.
  - `question`: at most one of Gremly's open questions, `{id, question}`, on a day the model judged natural to ask it.
  - `return`: `{days_away, note}`, only when `days_away_before_today` is 3 or more.
- **Other fields:**
  - `named_anchors`: dated facts in the next 30 days that the model judged still ahead, up to 8, never private. Each is `{label, date, confidence, fact_id}`.
  - `active_today.upcoming_in_7d` is the same list cut to 7 days.
  - `today_focus` (0 to 3 items), `lead_story`, `also_matters`, `voice_note`, `tone`, `day_type`.
  - `absence`: the raw `absence_snapshot` (below).
- **Old field names kept for the current app:** `brief_headline`, `lead_story`, `today_focus` and `daily_focus`. `habit_streak_risk`, `week_recap` and `recent_context` are left empty in v4.

## Absence and app activity

- **`absence_snapshot(p_user)` RPC** (service role only) returns:
  - `days_since_active`, `days_away_before_today` and `last_active_day_before_today`.
  - `active_days_last_7` and `active_days_last_30`.
  - `last_by_surface`, the last time per surface: drop, journal, todo done, habit check-in, chat, sweep.
- **Active days:** `user_activity_days` counts a day as active from those records and from `app_events`.
- **`app_events`:** written from the app with `logAppEvent` / `useAppEventOnFocus` in `lib/appEvents.ts`. `app_open` is throttled to one per 30 minutes. `story_view` and `world_view` are also logged. A day the app was only opened therefore counts as a day back.
- **Return note timing:** the DCO's return note is decided when the DCO is built (from 4am). It does not know about an open later the same morning.

## Gremly's questions

- **Table:** `gremly_questions`, with status `open`, `asked`, `answered`, `dismissed` or `expired`, and an optional `about_fact_id`. Questions are written by the ledger reader while it reads records.
- **Review:** `reviewQuestions` in `context/questions.js` retires questions that are out of date, already answered by the ledger, or duplicates. It runs after each ledger read and before every DCO build, so the question in a brief has been checked that morning.
- **Answering:** an answer goes through cortex `type: 'not-right'` with `surface: 'question'` and `target_ref.id` = the question id, then to inngest-jobs `/api/correction`. That path updates the ledger, marks the question answered with the person's words, and rewrites any passage that depended on it. In the app it is `answerQuestion(id, text)` in `lib/story/storyApi.ts`.
- **Screen:** `GremlyQuestionsScreen` lists open questions, reached from the bottom of Your story.

## Corrections ("Not right?")

- **Entry points:** one path, `/api/correction` in inngest-jobs, reached from:
  - the app button (cortex `not-right`);
  - chat, where `checkForCorrection` in `workers/cortex/context/corrections.js` runs after each Ask Gremly turn and sends the person's own words.
- **Kinds:** `wrong`, `changed`, `done` and `private`.
- **What it does:** updates facts, story items, Worlds, Chapters and today's DCO straight away, and clears the chat cache.
- **Surfaces:** `user_corrections.surface` allows `brief`, but nothing sends that surface yet.
- **App:** `components/story/NotRightSheet.tsx` takes a target `{text, kind, id}`. `NotRightLink` is the button.
- **Decision made in this project:** no long-press anywhere. The button sits at the bottom of Your story, a World and a Chapter. In chat the person just says it.

## Private items

- **Rules:** `PRIVATE_RULES` in `workers/inngest-jobs/careRules.js` is the shared definition of what is private and where it may appear.
- **Glanceable lines:** notification lines, headlines and card lines never carry a private item. Places the person opens on purpose (their story, chat, a World or Chapter) can.
- **In the DCO:** a private fact is never in the headline, day shape, lead, focus, anchors or reach. The code also drops private facts from claims, reach and anchors.
- **Facts:** `life_facts.private` is set by the reader and by corrections.

## Context chat already reads

- **`getLifePack` and `recallForMessage`** in `workers/cortex/context/lifeContext.js` are read through `chatProjection.js`. They give the latest `dco.brief`, the person's story, Worlds and recent ledger facts.
- **The story:** `user_life_map.life_map.story`, written monthly by `context/story.js`. It holds milestones, proud moments, patterns and people, and `story_for_them` in the second person. Milestones and proud moments must cite a fact that happened. `voice_note` in the DCO may lean on a proud moment on a heavy day.

## Shared pieces

- **Prompt rules:** `CARE_RULES`, `WRITING_RULES` and `personBlock` in `careRules.js` are given to every model that writes about a person's life. They cover:
  - reading dates against today;
  - gaps in app use are not mood;
  - no em dashes;
  - pronouns never guessed.
- **Models:** `context/llm.js` provides `jsonCall` with a primary and a fallback model and strict JSON schemas, and `modelFor(env, job)` gives the model tiers. Calls are logged to `ai_usage` with their cost.
- **Usage:** `my_usage_rollup` (authenticated RPC) and `usage_rollup` give activity per week or month.
- **Pipeline switch:** `CONTEXT_PIPELINE` in `workers/inngest-jobs/wrangler.toml` is `on` for everyone from this branch.

## Mockups

- **Canvas:** "Gremly: Life Context Screens" (https://claude.ai/artifact/51WLEUiRxpxuKm1j9ofjgC) has the boards agreed for the brief: the countdown chip with one question, the first open after time away, and the Not right? sheet.
- **Spec:** the brief's own prototype (`Claude outputs/morning-brief-in-chat.html`) stays the spec.

## The brief plan's DCO list, against what exists

| The plan asks for | What exists |
| --- | --- |
| Upcoming things with countdowns | `named_anchors` with dates and fact ids. The countdown number is not computed in the DCO, and the prototype's "8 days to Japan" is a placeholder. |
| Habits behind for the week | Each habit's progress this week goes into the model. Habits that need today appear in `brief.claims` with `type: 'habit'`. There is no computed "behind" list (`habit_streak_risk` is empty). |
| Undated items made relevant by context | `brief.reach`, with the facts that give the reason. |
| Back after time away | `brief.return` and the raw `absence` snapshot. |
| Yesterday's reaction to the brief | Not built. There is no daily thread yet to read it from. |
