# Gremly Gap Analysis Report
## Soul Document v6 vs Current Codebase

*Generated: 2026-03-08*

---

## 1. Gremly Age & Tier System

### What exists

Age is stored in both **Zustand** and **Supabase**:

- **Zustand store** (`lib/store/useGremlyStore.ts`): Properties `gremlyAge`, `gremlyAgeLastIncrementedAt`, `todayRitualCompletedAt`, `todayDropsCount`, `todaySweepsCount`
- **Supabase**: `cortex_preferences` table has `gremly_age` and `gremly_age_last_incremented_at` columns. The `daily_ritual_progress` table tracks `drops_count`, `sweeps_count`, and `ritual_completed_at` per `ritual_day`.

**Current age-up logic** (`useGremlyStore.ts`, lines 1548–1605, `checkAndIncrementAge()`):
- Calls Supabase RPC `check_and_increment_gremly_age` with `p_owner_id` and `p_ritual_day`
- If `did_age_up` is true, updates `gremlyAge`, `gremlyAgeLastIncrementedAt`, `todayRitualCompletedAt`, and triggers `AgeUpCelebrationModal`
- Age-up is triggered by `incrementDropCount()` (lines 1493–1517) and `incrementSweepCount()` (lines 1519–1546), each calling their respective RPCs then calling `checkAndIncrementAge()`

**Current trigger**: Binary — 3 drops + 3 sweeps in a day = +1 age. Age is a raw number (0, 1, 2, ..., 100+). No tiers, no tier names, no tier personalities.

**Tiers**: Do NOT exist in the age/progression system. The only "tier" concept is temperature tiers in `lib/chat/gremlyPersona.ts` (`TEMP_TIERS = { low: 0.3, mid: 0.5, high: 0.7 }`) which control chat response temperature per triage mode — unrelated to Soul Document tiers.

**Gremly modal**: No dedicated Gremly modal exists. The Gremly appears in:
- `components/ritual/RitualProgressIndicator.tsx` — shows age in days + two 3-dot progress rows
- `components/mascot/Mascot.tsx` — emoji-based fallback (idle/thinking/replying/playful/celebration/rest), 64px default, Lottie support commented out
- `components/today/TodayMascotHeader.tsx` — 72x72 mascot PNG with wave animation on Today screen
- MindDrop screen (`app/screens/CatchAllNotepad.tsx`) — displays mascot with speech bubbles

**Celebrations**: `components/ritual/AgeUpCelebrationModal.tsx` shows video, haptics, and milestone messages for ages 1–100. No tier transition celebrations.

**Wandering mechanic**: Does NOT exist. Age only increments, never decrements. No unfed-day tracking, no regression logic, no tier floor protection.

### Soul Document target

- **Feeding Gauge** fills throughout the day with weighted actions (drops, sweeps, Morning Brief, etc.)
- When gauge crosses "fed" threshold → that's a **fed day**
- **Every 3 fed days → age up** (fed days need NOT be consecutive)
- **11 tiers** with names, age ranges, and distinct personalities:
  - Phase 1: Hatchling (0–2), Nestling (3–5), Sprout (6–9), Explorer (10–15)
  - Phase 2: Scout (16–25), Pathfinder (26–40), Guide (41–60)
  - Phase 3: Sage (61–120), Elder (121–250), Ancient (251–500), Wizard (501+)
- **Tier personalities** evolve Gremly's voice (Hatchling = "!!", Sage = "Some of this can wait")
- **Visual evolution** within tiers (subtle) and at tier transitions (events)
- **Gremly modal** (2 pages): Page 1 = feeding status + age + tier + fed-days progress; Page 2 = training card / stats
- **Milestone moments** at specific ages with unlocks (Socks, accessories, shareable cards)
- **Wandering**: 3 consecutive unfed days = age back by 1, tier floor protection, Sock protection option

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Age storage | Partial | Age stored in Zustand + Supabase, but no `fed_days_count`, `current_tier`, `unfed_streak_count` |
| Age-up trigger | Needs rework | Currently binary (3 drops + 3 sweeps). Needs: Feeding Gauge threshold → fed day → 3 fed days = age up |
| Tiers | Not implemented | No tier names, ranges, constants, or lookup logic anywhere |
| Tier personalities | Not implemented | Chat has voice stages (NEW/BUILDING/TRUSTED) but not tier-mapped |
| Gremly modal | Not implemented | No tappable modal with feeding/age/training info |
| Wandering mechanic | Not implemented | No backward aging, no unfed-streak tracking, no tier floor protection |
| Visual evolution | Not implemented | Mascot is static emoji/PNG, no tier-dependent visuals |
| Milestone unlocks | Not implemented | AgeUpCelebrationModal has milestone messages but no unlocks |

### Key files

- `lib/store/useGremlyStore.ts` — central store, age state + `checkAndIncrementAge()`
- `components/ritual/RitualProgressIndicator.tsx` — current 3-dot progress display
- `components/ritual/AgeUpCelebrationModal.tsx` — age-up celebration
- `components/mascot/Mascot.tsx` — mascot rendering (emoji fallback)
- `lib/chat/gremlyPersona.ts` — chat temperature tiers (not progression tiers)
- `workers/cortex/gremlyPersona.js` — worker-side persona (same temp tiers)

### Dependencies

- Section 2 (Feeding Gauge) — age-up depends on fed days, which depend on gauge
- Section 8 (Notifications) — pre/post-regression notifications, age-up approaching
- Section 9 (Chat) — tier personalities drive chat voice
- Section 12 (Onboarding) — age de-emphasized during training week
- Section 13 (Sock Economy) — Socks protect against wandering
- Section 15 (Supabase) — new columns needed: `current_tier`, `fed_days_count`, `unfed_streak_count`

---

## 2. Feeding / Offload Gauge

### What exists

**No Feeding Gauge exists.** The closest equivalent is `RitualProgressIndicator.tsx`:
- Two rows of 3 dots: drops (filled per `todayDropsCount`) and sweeps (filled per `todaySweepsCount`)
- Threshold: `REQUIRED_COUNT = 3` for each
- Last sweep dot replaced with green checkmark when all 3 complete
- Labels: "drops" and "swept"

**Today screen gauges** (`components/today/v3/TodayProgressGauges.tsx`):
- Two 3/4-ring progress gauges (270-degree arc) for daily todos and weekly progress
- `GAUGE_SIZE = 88`, `STROKE_WIDTH = 9`
- These track todo completion, NOT feeding/engagement

**`TodayProgressCard.tsx`**: Single progress ring with center text — also for todo tracking, not feeding.

**`CapacityRing.tsx`** (Morning Brief): Circular capacity ring — shows workload capacity, not feeding.

**Daily engagement tracking**: `daily_ritual_progress` table tracks `drops_count` and `sweeps_count` per `ritual_day`. No gauge value, no weighted scoring, no "fed" boolean.

**No gauge-related constants**: No weights, thresholds, diminishing returns curves, or daily reset logic for a Feeding Gauge.

**No "enough for today" concept**: The 3-dot system shows completion of 3 drops and 3 sweeps but there's no unified "fed" state or celebration.

**Daily reset**: `ensureCurrentRitualDay()` (lines 1422–1491) and `handleDayRollover()` (lines 3546–3579) reset `todayDropsCount` and `todaySweepsCount` at the day boundary. This is the reset mechanism that would need to be extended for a gauge.

### Soul Document target

A **Feeding Gauge** that:
- Lives primarily on the MindDrop screen, wrapping around or beneath the Gremly
- Fills with weighted engagement actions:
  - **Mind Drops**: Foundation. Drops 1–5 move gauge meaningfully, 6–10 less, 11+ barely (diminishing returns)
  - **Sweeps**: Highest single-action value (~30–40% of gauge). Floor of ~20% for 1 card, cap at 5–10 cards. Journaling bonus ~10–15%
  - **Morning Brief + Lock In**: ~15–20% of gauge
  - **Spaces**: Small bump for visiting, one-time bonus for creating
  - **Habit completion**: Indirect only (via sweep flow)
  - **Weekly Summary**: NOT an input
- **"Fed" threshold**: Reachable in 3–5 minutes of genuine engagement
- **Typical paths to fed**: 5 drops + 1 sweep; or 8–10 drops alone; or 1 sweep with journaling + 2–3 drops; or Morning Brief + Lock In + 3–4 drops
- **"Fed" moment**: In-app celebration (happy animation, "Gremly is fed! Day X of 3 toward your next age-up")
- **Beyond-fed bonus zone**: Engagement past threshold contributes small amount toward next cycle
- **Glanceable indicator** on Today screen (Gremly expression or subtle ring)
- **Gauge moment** on Sweep completion screen (feeding-aware copy)
- **Full gauge** in Gremly modal (Page 1)

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Feeding Gauge UI | Not implemented | No gauge component; 3-dot indicator is the only visual |
| Weighted scoring | Not implemented | No weights, no diminishing returns, no composite score |
| "Fed" state | Not implemented | No boolean, no threshold, no celebration |
| Fed-day counter | Not implemented | No `fed_days_count` property in store or DB |
| Daily reset for gauge | Partial | Day rollover resets drop/sweep counts — would need to reset gauge value too |
| Gauge on MindDrop | Not implemented | MindDrop shows 3-dot indicator, not a gauge |
| Gauge on Today | Not implemented | Today shows todo progress rings, not feeding state |
| Gauge on Sweep completion | Not implemented | Sweep completion has badges but no feeding reference |
| Gauge in modal | Not implemented | No Gremly modal exists |
| Diminishing returns | Not implemented | No curve logic |
| Gauge constants | Not implemented | No thresholds, weights, or config |

### Key files

- `components/ritual/RitualProgressIndicator.tsx` — current 3-dot system (to be replaced)
- `components/today/v3/TodayProgressGauges.tsx` — existing ring gauge component (reusable pattern)
- `components/today/v3/TodayProgressCard.tsx` — existing single ring component
- `lib/store/useGremlyStore.ts` — store needs new gauge state properties
- `app/screens/CatchAllNotepad.tsx` — MindDrop screen where gauge should live
- `app/screens/SweepFlowScreen.tsx` — sweep completion needs gauge moment

### Dependencies

- Section 1 (Age) — fed days drive age-up
- Section 3 (Mind Drop) — drops are primary gauge input
- Section 4 (Evening Sweep) — sweeps are highest single-action value
- Section 5 (Morning Brief) — Morning Brief + Lock In = ~15–20% of gauge
- Section 8 (Notifications) — feeding-aware notification copy
- Section 13 (Sock Economy) — Sock gauge boost
- Section 15 (Supabase) — new columns: `feeding_gauge_value`, `is_fed_today`, `fed_days_count`

---

## 3. Mind Drop

### What exists

**MindDrop screen**: `app/screens/CatchAllNotepad.tsx` (~344.6KB, the largest screen file)

**Drop input**: Text input at the bottom of the screen. Users type a thought and submit. The drop is immediately visible as a card.

**Drop counting per day**: Yes — `todayDropsCount` in the store, incremented via `incrementDropCount()` → Supabase RPC `increment_drop_count`. Tracked in `daily_ritual_progress` table.

**Classification pipeline**:
1. **Heuristic classify** (`lib/classify/heuristicClassify.ts`) — fast local classification
2. **Phase 1** — remote classification via Cortex worker (`workers/cortex/`)
3. **Phase 1.5a** — entity extraction
4. **Phase 2** — AI enrichment (title generation, space assignment, etc.)

**Gremly on this screen**: Mascot appears with speech bubbles via `lib/speech/gremlySpeech.ts`. Speech categories: `greeting`, `success`, `streak`, `photo`, `error`, `empty`, `returning`. Time-of-day aware (morning/afternoon/evening/night). Message deduplication (tracks last 4). Duration: base 3000ms + 50ms/char, max 6000ms.

**Animation/reaction on drop**: Mascot state changes (thinking while processing, celebration on success). Speech bubble shows contextual message. `CelebrationController` fires `item_created` event.

### Soul Document target

- **Feeding Gauge** lives on MindDrop screen, wrapping around or beneath the Gremly
- Drop → Gremly reacts → gauge visibly fills — all in one moment
- Drops 1–5 each move gauge meaningfully; 6–10 less; 11+ barely (diminishing returns)
- Drops are "the foundation" — the single behavior being conditioned
- The first few drops of the day should feel impactful
- **In-app tooltip/hint** showing typical paths to "fed" (e.g., "A few drops and a sweep usually does it")

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Drop input | Implemented | Works well |
| Drop counting | Implemented | `todayDropsCount` tracks daily drops |
| Classification pipeline | Implemented | Heuristic → Phase 1 → Phase 1.5a → Phase 2 |
| Speech bubbles | Implemented | Context-aware, time-of-day, deduplicated |
| Mascot reactions | Implemented | State changes on drop (thinking → celebration) |
| Feeding Gauge display | Not implemented | No gauge on this screen |
| Gauge movement on drop | Not implemented | No visual feedback showing gauge filling |
| Diminishing returns | Not implemented | All drops count equally toward the 3-drop threshold |
| "Fed" tooltip/hint | Not implemented | No guidance on paths to fed |
| Gremly expression by feeding state | Not implemented | Mascot state not tied to gauge level |

### Key files

- `app/screens/CatchAllNotepad.tsx` — main MindDrop screen
- `lib/speech/gremlySpeech.ts` — speech bubble content system
- `lib/classify/heuristicClassify.ts` — local classification
- `lib/store/useGremlyStore.ts` — `incrementDropCount()`, `todayDropsCount`
- `components/mascot/Mascot.tsx` — mascot rendering
- `components/ritual/RitualProgressIndicator.tsx` — current 3-dot display on this screen

### Dependencies

- Section 2 (Feeding Gauge) — gauge must appear on this screen
- Section 7 (DCO) — drops are extraction input for daily context
- Section 9 (Chat) — classification feeds into chat context

---

## 4. Evening Sweep

### What exists

**Sweep flow**: `app/screens/SweepFlowScreen.tsx` (~188KB)

**Steps** (6-step flow):
- **Step 0**: Intro ("Ready to Sweep?")
- **Step 0.25**: MultiSplit (for unresolved multi-drops)
- **Step 0.5**: Lock-In Checkpoint (for locked items)
- **Step 1**: Decision cards (process items one at a time — keep/archive/delete/reschedule)
- **Step 2**: Habits check-in
- **Step 3**: Mood check-in
- **Step 4**: Summary/celebration

**Components**:
- `SweepCard` — individual decision card
- `SweepDemoFlow` — demo/tutorial mode
- `SweepGremlyHeader` — mascot header during sweep
- `SweepMultiSplitStep` — multi-drop handler
- `SweepSectionTransition` — section transitions

**Celebration**: Yes — age-up celebration can trigger after sweep completion via `celebrationController`. `CelebrationProvider` manages overlay.

**Journaling**: Journaling during sweep exists as part of the sweep card actions (users can add notes/journal on items during processing).

**Card count**: Tracked during sweep session via the decision cards flow.

**Sweep completion screen**: Shows badges and summary. Does NOT reference feeding or gauge state.

### Soul Document target

- Sweep = highest single-action gauge value (~30–40% of gauge)
- Floor: sweeping 1 card = ~20% of gauge (credit for doing the ritual)
- Cap: sweeping 5+ cards = full sweep value; 20 cards ≠ more than 10
- Journaling bonus: ~10–15% of gauge
- **Sweep completion screen** becomes feeding-aware:
  - Almost fed: "Nice sweep! Your mind is 8 items lighter. Gremly is almost fed."
  - Now fed: "Nice sweep! Gremly is fed for today! Day X of 3 toward your next age-up."
  - Already fed: "Nice sweep! Your mind is 8 items lighter. Bonus points for Gremly."
- Celebration animation pairs with gauge movement

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Sweep flow | Implemented | 6-step flow with cards, habits, mood, summary |
| Card processing | Implemented | Keep/archive/delete/reschedule actions |
| Habit check-in in sweep | Implemented | Step 2 |
| Mood check-in | Implemented | Step 3 |
| Journaling in sweep | Implemented | Can add notes during card processing |
| Sweep count tracking | Implemented | `incrementSweepCount()` |
| Gauge contribution | Not implemented | Sweep doesn't contribute to a gauge |
| Weighted sweep value | Not implemented | No floor/cap/journaling bonus logic |
| Feeding-aware completion copy | Not implemented | Summary shows badges, not gauge state |
| Gauge moment on completion | Not implemented | No gauge animation on completion screen |

### Key files

- `app/screens/SweepFlowScreen.tsx` — main sweep flow
- `lib/store/useGremlyStore.ts` — `incrementSweepCount()`, `markSweepCompleted()`
- `lib/sweep/habitHelpers.ts` — habit grouping for sweep
- `app/features/celebration/CelebrationController.ts` — celebration triggers

### Dependencies

- Section 2 (Feeding Gauge) — sweep is highest single-action gauge contributor
- Section 1 (Age) — sweep completion feeds into age-up via fed days
- Section 11 (Habits) — habits checked during sweep
- Section 8 (Notifications) — evening notification tied to sweep/feeding

---

## 5. Morning Brief + Lock In

### What exists

**Morning Brief**: `app/components/morning-brief/` directory

**5-step flow**:
1. **StepGlance** — overview of day (calendar events, DCO headline, Gremly summary)
2. **StepSweep** — mini sweep for carryover items
3. **StepPrioritize** — set priorities, capacity meter
4. **StepOrganize** — organize items by time blocks
5. **StepPlan** — final plan review

**Components**:
- `MorningBriefSheet.tsx` — container
- `MorningBriefStepper.tsx` — step progression
- `CapacityRing.tsx` / `CapacityBar.tsx` / `SegmentedCapacityBar.tsx` — workload capacity visualization
- `LockInPicker.tsx` — Lock In selection (`MAX_LOCK_INS = 3`)
- `GremlySummary.tsx` — Gremly's take on the day (DCO-powered)
- `TodaysKeyDatesSection.tsx` — calendar events
- `TimeBlockPicker.tsx` / `TimeBlockSection.tsx` — time blocking

**Lock In**: Implemented via `LockInPicker`. Users select up to 3 items to commit to for the day. Lock In items are tracked separately from regular todos.

**3+ items gate**: Morning Brief requires items in the system to be useful. The `MiniSweepGate` component handles conditional display.

**Calendar integration**: Calendar events shown in `StepGlance` via `TodaysKeyDatesSection`. Calendar settings at `app/screens/CalendarSettingsScreen.tsx`. Calendar worker at `workers/calendar/` handles OAuth + event fetching for Outlook/Google.

**Day rollover**: `handleDayRollover()` (lines 3546–3579 in `useGremlyStore.ts`) handles day reset. `ensureCurrentRitualDay()` (lines 1422–1491) validates current ritual day.

### Soul Document target

- Morning Brief + Lock In = ~15–20% of Feeding Gauge
- Rewards the ritual of planning and committing, NOT execution of locked items
- Completing locked-in items does NOT add to gauge
- Day 3 of training introduces Morning Brief + Lock In
- Requires 3+ items (natural gate)
- Promotes calendar integration during training: "Connect your calendar so Gremly knows what's on your plate"

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| 5-step Morning Brief flow | Implemented | Glance → Sweep → Prioritize → Organize → Plan |
| Lock In | Implemented | LockInPicker with MAX_LOCK_INS = 3 |
| Calendar integration | Implemented | Outlook/Google via calendar worker |
| DCO-powered glance | Implemented | GremlySummary shows DCO headline |
| Capacity visualization | Implemented | Multiple capacity ring/bar components |
| 3+ items gate | Implemented | MiniSweepGate |
| Gauge contribution | Not implemented | Completing Morning Brief doesn't fill gauge |
| Feeding-aware copy | Not implemented | No gauge reference in Morning Brief |
| Calendar integration promotion in training | Not implemented | No onboarding prompt for calendar setup |

### Key files

- `app/components/morning-brief/MorningBriefSheet.tsx` — container
- `app/components/morning-brief/MorningBriefStepper.tsx` — step flow
- `app/components/morning-brief/components/LockInPicker.tsx` — Lock In
- `app/components/morning-brief/components/GremlySummary.tsx` — DCO summary
- `app/components/morning-brief/components/CapacityRing.tsx` — capacity gauge
- `lib/store/useGremlyStore.ts` — `handleDayRollover()`, `ensureCurrentRitualDay()`

### Dependencies

- Section 2 (Feeding Gauge) — Morning Brief + Lock In = 15–20% of gauge
- Section 7 (DCO) — DCO powers the glance step
- Section 12 (Onboarding) — Day 3 tutorial introduces Morning Brief

---

## 6. Weekly Summary ("The Rundown")

### What exists

**Library**: `lib/weeklySummary/`
- `buildTrendContext.ts` — computes trend analysis across weeks
- `buildWeeklySummaryPayload.ts` — constructs API payload with todos, habits, drops, mood data
- `generateWeeklySummary.ts` — main generation logic
- `index.ts` — exports

**Screen**: `app/screens/WeeklySummaryScreen.tsx`
- Horizontal paginated card flow
- Background: `#FFF6ED` (warm palette) with sage accents

**Card types**:
- `WeeklySummaryContent` — main week-in-review content
- `WeeklySummaryInsight` — AI-generated insights
- `WeeklySummaryMagicMoment` — notable moments from the week
- `WeeklySummaryRecommendation` — smart suggestions
- `WeeklySummaryWeekAheadHighlight` — upcoming highlights

**Stale item triage**: Present in sweep flow and weekly summary — actions include Lock In, Reschedule, Remind, Drop.

**Model**: Weekly summary generation uses Claude (via Anthropic API key in notifications worker). The exact model is configured in the generation logic.

**First-week encouragement flag**: Does NOT exist. No special handling for the user's first weekly summary.

**Graduation tie-in**: NOT implemented. Weekly summary is not connected to onboarding or training completion.

### Soul Document target

- First weekly summary is the **graduation moment** — triggered on Day 7 or when all tutorials complete
- Loading state builds anticipation: "Your Gremly is crunching everything it learned about you..."
- Push notification: "SPECIAL REPORT FROM YOUR NEWLY TRAINED GREMLY"
- Summary reflects user's habits, mental patterns, priorities — proves Gremly "knows" them
- This is the **conversion moment** — paywall hook
- Weekly summary notification enhanced: "Your Gremly was fed X out of 7 days this week. Your brain report is ready."
- Weekly summary is NOT a gauge input (viewing doesn't fill gauge)

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Card-based flow | Implemented | Horizontal paginated cards |
| Trend analysis | Implemented | `buildTrendContext.ts` |
| Stale triage actions | Implemented | Lock In/Reschedule/Remind/Drop |
| AI-generated insights | Implemented | Insight + MagicMoment + Recommendation cards |
| Week ahead highlights | Implemented | WeekAheadHighlight card |
| First-week encouragement | Not implemented | No special first-summary handling |
| Graduation moment | Not implemented | Not tied to training completion |
| Anticipation loading state | Not implemented | No "crunching" animation |
| Feeding-aware notification | Not implemented | No "fed X of 7 days" in notification copy |
| Conversion moment framing | Not implemented | No paywall hook on first summary |

### Key files

- `app/screens/WeeklySummaryScreen.tsx` — main screen
- `lib/weeklySummary/generateWeeklySummary.ts` — generation logic
- `lib/weeklySummary/buildWeeklySummaryPayload.ts` — payload construction
- `lib/weeklySummary/buildTrendContext.ts` — trend computation
- `workers/notifications/index.js` — weekly summary notification + generation endpoints

### Dependencies

- Section 12 (Onboarding) — first summary is graduation moment
- Section 8 (Notifications) — weekly summary notification needs feeding data
- Section 7 (DCO) — weekly context feeds into summary

---

## 7. DCO (Daily Context Object)

### What exists

**Generation**: `workers/inngest-jobs/index.js` — Inngest-based background job processing

**Two-phase pipeline**:
1. **Extraction** (gpt-4.1-nano): Extracts structured data from user's recent activity
2. **Analysis** (gpt-4.1-mini): Produces the DCO with life context, tone, focus, etc.

**Schedule**: Hourly dispatcher, primary generation at 4 AM user local time.

**DCO Schema** (from `workers/cortex/context/dcoContext.js`):
```javascript
{
  lifeMoment: string | null,     // e.g., "Work sprint", "Recovery mode"
  tone: string | null,           // e.g., "calm", "urgent"
  todayFocus: string | null,     // Main theme/focus for today
  namedAnchors: string[],        // Reference points
  activeToday: string | null,    // Currently active element
  briefHeadline: string | null,  // Morning Brief headline
  generatedAt: string | null     // ISO timestamp
}
```

**Storage**: `user_daily_state` table, `dco` JSONB column.

**Caching**: KV cache with 2-hour TTL. Cache key: `dco-context:{userId}`.

**Retrieval** (`workers/cortex/context/dcoContext.js`, lines 7–71): Fetches from Supabase, caches in KV, falls back gracefully to null.

**Inputs**: Recent drops, habits, sweeps, calendar events, spaces, mood signals, user profile. Soul Document injection is implemented (commit `6c5f8382`).

**Soul Document injection**: Implemented — the Soul Document text is injected into the DCO generation prompt so the AI understands Gremly's philosophy.

**Cold start**: Falls back to null if no DCO exists. Not explicitly handled beyond graceful degradation.

### Soul Document target

- DCO powers ALL AI touchpoints: home screen speech, Morning Brief glance, sweep celebration, chat context, notifications
- **Three AI modes** determine how touchpoints behave:
  - **Encouragement** (early/thin data): Acknowledges what user HAS done, nudges next steps, never shames
  - **Insightful** (enough data, active user): Surfaces genuine personal, situational awareness
  - **Observant** (long-term light user, 4+ weeks low activity): Quietly present, fewer nudges
- Mode determined by: data density + activity recency + contextual confidence
- No hard switches — gradual transition
- **On-demand DCO generation** for new users (triggered when no daily context exists)
- **Phase 9 event annotations** — tap calendar event → create linked Mind Drop

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Two-phase generation | Implemented | gpt-4.1-nano extraction → gpt-4.1-mini analysis |
| DCO schema | Implemented | lifeMoment, tone, todayFocus, namedAnchors, activeToday, briefHeadline |
| Supabase storage | Implemented | `user_daily_state` table, `dco` JSONB |
| KV caching | Implemented | 2-hour TTL |
| Soul Document injection | Implemented | Commit 6c5f8382 |
| Multi-input enrichment | Implemented | Drops, habits, sweeps, calendar, spaces, mood, profile |
| AI modes (encouragement/insightful/observant) | Not implemented | No mode selection logic, no data density scoring |
| On-demand generation for new users | Not implemented | Only scheduled generation exists |
| Phase 9 event annotations | Not implemented | No calendar event → Mind Drop linking |
| Cold start strategy | Partial | Falls back to null, but no encouragement-mode fallback content |
| Feeding gauge state in DCO | Not implemented | DCO doesn't include gauge/feeding data |

### Key files

- `workers/inngest-jobs/index.js` — DCO generation pipeline (Inngest functions)
- `workers/cortex/context/dcoContext.js` — DCO retrieval + caching
- `workers/cortex/contextBuilder.js` — builds context for chat (includes DCO)
- `lib/store/useGremlyStore.ts` — DCO state in store

### Dependencies

- Section 5 (Morning Brief) — DCO powers glance step
- Section 9 (Chat) — DCO injected into chat context
- Section 8 (Notifications) — DCO tone modulates notification copy
- Section 19 (Home Screen) — DCO powers speech bubble
- Section 2 (Feeding Gauge) — DCO should include feeding state for touchpoints

---

## 8. Notification System

### What exists

**Worker**: `workers/notifications/index.js`
- Cron: every 5 minutes (`*/5 * * * *`)
- Per-user timezone-aware scheduling
- 5-minute window matching with midnight wraparound

**Notification types** (current):
1. **Morning notification** — contextual headline from DCO or generic "Your Morning Brief is waiting"
2. **Afternoon notification** — lock-in check-in, overdue items. Suppressed if active in last 2 hours
3. **Evening notification** — sweep reminder. DCO tone-aware (relaxed = skip, recovering = soften copy)
4. **Weekly summary notification** — first sentence of weekly commentary
5. **Test notification** — manual trigger via `/test` endpoint
6. **Backfill notification** — via `/backfill-weekly` endpoint

**Deduplication**: Atomic via Supabase RPC `claim_notification_slot` — prevents duplicate sends within the same window.

**DCO tone awareness**: Evening notification checks DCO tone:
- `relaxed` → skip evening notification
- `recovering` → soften copy ("Quick check-in whenever you're ready")

**Push delivery**: Expo Push API with deep link data for in-app routing.

**Auto-reminder detection**: NOT found in the notification worker. No "remind me to..." parsing from Mind Drops.

**iOS action buttons**: NOT found. No Done/Snooze/Open buttons on notifications.

**Feeding-aware**: NOT feeding-aware. No gauge state in notification copy. No "almost fed" or "age-up approaching" variants.

**Frequency reduction**: NOT implemented. No automatic reduction as habit forms.

### Soul Document target

**Notification types (target)**:
- **Morning**: Feeding-state + AI-context aware copy (5 variants based on fed yesterday, not fed, 2 days unfed, post-regression)
- **Afternoon**: Gauge-aware copy (close to fed = "one more drop", low gauge = "anything piling up?", already fed = suppress)
- **Evening**: Feeding-completion tied ("One sweep away from feeding Gremly today")
- **"Almost fed"** (NEW): Fires once/day ~4–5pm if gauge 60–80%, not active in 2hrs, not fed
- **"Age-up approaching"** (NEW): When 2 of 3 fed days complete, evening variant
- **"Pre-regression warning"** (NEW): At 2-day unfed mark, extremely gentle copy
- **"Post-regression"** (NEW): Morning after regression, warm not punitive
- **Weekly summary**: Enhanced with "fed X of 7 days this week"

**Frequency curve**:
- Training week: up to 3/day
- Weeks 2–4: 2–3/day
- Month 2+: 1–2/day
- Consistent feeder (3+ weeks): morning only or just evening sweep

**Core principles**: Never guilt, contextual not scheduled, decreasing frequency, calendar-aware.

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Morning notification | Partial | Exists with DCO headline, but not feeding-state aware |
| Afternoon notification | Partial | Exists with lock-in check, but not gauge-aware |
| Evening notification | Partial | Exists with DCO tone awareness, but not feeding-tied |
| Weekly summary notification | Partial | Exists but no "fed X of 7 days" |
| "Almost fed" notification | Not implemented | New notification type needed |
| "Age-up approaching" notification | Not implemented | New notification type needed |
| "Pre-regression warning" | Not implemented | New notification type needed |
| "Post-regression" notification | Not implemented | New notification type needed |
| Deduplication | Implemented | `claim_notification_slot` RPC |
| DCO tone awareness | Implemented | Relaxed/recovering modulation |
| Feeding-aware copy | Not implemented | No gauge state in any notification |
| Frequency reduction curve | Not implemented | No automatic reduction logic |
| Auto-reminder from drops | Not implemented | No "remind me to..." parsing |
| iOS action buttons | Not implemented | No Done/Snooze/Open |

### Key files

- `workers/notifications/index.js` — notification worker (cron + endpoints)
- `workers/notifications/wrangler.toml` — worker config (cron: `*/5 * * * *`)

### Dependencies

- Section 2 (Feeding Gauge) — gauge state drives notification copy
- Section 1 (Age) — age-up approaching and regression notifications
- Section 7 (DCO) — DCO tone/context powers notification copy
- Section 12 (Onboarding) — training week gets higher notification frequency

---

## 9. Chat System

### What exists

**Triage architecture** (`workers/cortex/triage.js`): 15 modes:

1. `emotional` — processing feelings, overwhelm
2. `venting` — letting off steam
3. `accountability` — reporting missed/skipped
4. `celebration` — sharing a win
5. `update` — reporting back neutrally
6. `prioritization` — needs help choosing/ordering
7. `action_ready` — knows what they want, needs breakdown
8. `exploratory` — thinking out loud
9. `comparison` — weighing options
10. `research` — wants external information
11. `quick_ask` — simple direct question
12. `chit_chat` — greeting, small talk
13. `app_help` — asking how app works
14. `playful` — testing personality, jokes
15. `capture` — dropping a task mid-conversation

**Classification**: Two parallel gpt-4.1-nano calls (one for mode, one for search level). Search levels: `required`, `maybe`, `none`. Fallback: `{ mode: 'exploratory', search: 'none' }`.

**Preset mapping** (lines 36–45): `break_down` → action_ready, `research` → research, `think_through` → exploratory, etc.

**Chat models**: gemini-2.5-flash for chat responses.

**Voice stages** (`workers/cortex/gremlyPersona.js` / `lib/chat/gremlyPersona.ts`):
- 3 stages: NEW (age 0–2), BUILDING (age 3–9), TRUSTED (age 10+)
- Temperature tiers per mode (low: 0.3, mid: 0.5, high: 0.7)

**Context injection** (`workers/cortex/contextBuilder.js`): DCO injected into chat context header. Includes user's current situation, life moment, tone.

**Entity Chat**: Template/system prompt for chatting about a specific todo, note, or habit.

**Space Chat**: Template for chatting within a space context (`app/spaces/ChatThreadScreen.tsx`).

**Free-form Chat**: General purpose chat without specific entity context.

**Chat UI**: `components/chat/ChatBubble.tsx` — Harmonic Glass Design with user bubbles (dark moss) and assistant bubbles (transparent with golden pear accent). Rich content: web search badges, source favicons, image thumbnails, markdown, streaming cursor, saveable cards.

### Soul Document target

- **Tier-personality-aware voice**: Hatchling = "!!", Nestling = "BRAIN FOOD!", Sprout = "Ooh, I remember this one from yesterday!", Explorer = "Let's figure this out together!", Scout = "I've been thinking about what you said...", etc.
- AI mode (encouragement/insightful/observant) affects chat responses
- Chat context injection includes feeding state

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| 15 triage modes | Implemented | All 15 modes with parallel classification |
| Dual-model classification | Implemented | gpt-4.1-nano for mode + search |
| Chat responses | Implemented | gemini-2.5-flash |
| Voice stages | Partial | 3 stages (NEW/BUILDING/TRUSTED) but NOT tier-mapped |
| DCO context injection | Implemented | via contextBuilder.js |
| Entity Chat | Implemented | Template for specific items |
| Space Chat | Implemented | Template for space context |
| Free-form Chat | Implemented | General purpose |
| Chat UI | Implemented | Rich bubbles with search, sources, saves |
| Tier-personality voice | Not implemented | No Hatchling/Nestling/Sprout/etc. personalities |
| AI mode awareness | Not implemented | No encouragement/insightful/observant in chat |
| Feeding state in context | Not implemented | No gauge data in chat context |

### Key files

- `workers/cortex/triage.js` — 15-mode triage system
- `workers/cortex/gremlyPersona.js` — voice stages + temperature tiers
- `workers/cortex/contextBuilder.js` — DCO + context injection
- `lib/chat/gremlyPersona.ts` — client-side persona config
- `components/chat/ChatBubble.tsx` — chat UI component
- `app/spaces/ChatThreadScreen.tsx` — space chat screen

### Dependencies

- Section 1 (Age/Tiers) — tier determines chat personality
- Section 7 (DCO) — DCO injected into chat context
- Section 2 (Feeding Gauge) — feeding state should be in context

---

## 10. Spaces

### What exists

**Space screens**:
- `app/spaces/SpaceHomeScreen.tsx` — main space dashboard
- `app/spaces/ChatThreadScreen.tsx` — space chat interface

**Space components** (`components/spaces/`):
- `SpaceBanner.tsx` — header banner
- `SpaceSuggestionCard.tsx` — AI suggestion card
- `SpaceQuickAddModal.tsx` — quick add modal
- `ChatCard.tsx` — chat message card
- `WhatWeDiscussedCard.tsx` — discussion summary
- `MilestoneHeader.tsx` — milestone progress
- `PinnedItemsModal.tsx` — pinned items modal
- v22 subcomponents: `Header`, `ThreadCard`, `FocusTodayCard`, `AdaptiveSummary`, `InsightsRow`
- Overlays: `TimelineOverlay`, `NotepadOverlay`, `PeopleOverlay`

**Space selectors** (from store):
- `useSpaceById`, `useSpaceTodosFromStore`, `useSpaceHabitsFromStore`, `useSpaceNotesFromStore`
- `useSpaceItems`, `useSpacePinnedItems`, `useSpaceChats`
- `useEventsForSpace`, `useGoalsForSpace`, `useAssignmentSuggestionsForSpace`

**AI suggestions**: `SpaceSuggestionCard` displays AI-generated suggestions for the space. Nightly analysis generates recommendations.

**Make Actionable**: Button/flow to convert notes into actionable todos within a space.

**Space activity**: Tracked through chat conversations, items added, milestones completed.

**Milestones**: `MilestoneHeader` shows milestone progress. Goals tracked via `useGoalsForSpace`.

### Soul Document target

- Space activity gives **small gauge bump** for visiting, one-time bonus for creating
- Spaces engagement is rewarded but never punished for absence
- "A Gremly can be old but understimulated—Spaces engagement could unlock accessories faster or earn bonus Socks"
- Spaces are a long-term engagement tool, not a daily ritual

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Space dashboard | Implemented | Rich dashboard with cards, suggestions, milestones |
| Space chat | Implemented | Full chat interface |
| AI suggestions | Implemented | Nightly AI analysis generates suggestions |
| Make Actionable | Implemented | Note → todo conversion |
| Milestones | Implemented | Progress tracking |
| Space activity → gauge | Not implemented | No gauge contribution for space visits |
| Space creation → gauge bonus | Not implemented | No one-time gauge bonus |
| Accessory unlocks via spaces | Not implemented | No accessory system |

### Key files

- `app/spaces/SpaceHomeScreen.tsx` — space dashboard
- `app/spaces/ChatThreadScreen.tsx` — space chat
- `components/spaces/SpaceSuggestionCard.tsx` — AI suggestions
- `components/spaces/MilestoneHeader.tsx` — milestones

### Dependencies

- Section 2 (Feeding Gauge) — space activity contributes small gauge amount
- Section 13 (Sock Economy) — spaces could earn bonus Socks
- Section 9 (Chat) — space chat context

---

## 11. Habits

### What exists

**Habit helpers**: `lib/sweep/habitHelpers.ts`
- `groupHabitsForSweep()` — groups habits by cadence (daily/weekly/monthly/completed/needsSetup)
- `getHabitStreak()` — consecutive days completed
- `getWeeklyProgress()` — completions in rolling 7-day window
- `getMonthlyProgress()` — completions this month
- `isHabitCompletedToday()` — boolean check
- `getLastCompletionDate()`, `formatLastCompletedAt()` — recency tracking
- `normalizeCadence()`, `parseHabitFrequency()` — cadence parsing (e.g., "3x/week")
- `habitNeedsStartDate()` — setup validation

**Types**: `types/habit.ts`
```typescript
interface Habit extends BaseHabit {
  cadence: Cadence;  // 'daily' | 'weekly' | 'monthly'
  target_per_period?: number;
  target_per_day?: number;
  days_active?: number[] | null;  // 0=Sunday through 6=Saturday
  last_completed_at?: string | null;
  period_start_at?: string | null;
}
```

**Rolling window**: Yes — `getWeeklyProgress()` uses a rolling 7-day window, not calendar-bound. `getHabitStreak()` tracks consecutive days.

**Habit completion in sweep**: Step 2 of SweepFlowScreen — habits check-in.

**Habit time estimation**: `time_estimate_minutes` collected via habit builder. Present in the type definition.

**Screens**: `app/screens/HabitDetail.tsx`, `app/screens/HabitBuilder.tsx`, `app/screens/Habits.tsx` (via navigation routes).

### Soul Document target

- Habit completion is **indirect gauge only** — happens as part of sweep flow
- No separate gauge reward for habit completion (can't verify if someone actually did it)
- Rolling window, not calendar-bound streaks (already implemented)

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Rolling window streaks | Implemented | 7-day rolling window, not calendar-bound |
| Habit completion in sweep | Implemented | Step 2 of sweep flow |
| Habit builder | Implemented | Full builder with time estimation |
| Cadence support | Implemented | Daily/weekly/monthly |
| Indirect gauge contribution | Not applicable yet | Gauge doesn't exist, but when it does, habit completion via sweep is already part of sweep flow |
| Time estimation | Implemented | `time_estimate_minutes` in type + builder |

### Key files

- `lib/sweep/habitHelpers.ts` — habit grouping, streak, progress functions
- `types/habit.ts` — Habit type definition
- `app/screens/SweepFlowScreen.tsx` — habit check-in (Step 2)

### Dependencies

- Section 4 (Sweep) — habits checked in sweep
- Section 2 (Gauge) — indirect contribution via sweep flow

---

## 12. Onboarding / Training

### What exists

**Onboarding screen**: `app/screens/OnboardingScreen.tsx`

**3-step swipeable flow**:
1. **Welcome** (id: `welcome`): "Hi, I'm Gremly" — mascot intro, explains mental load management
2. **The Daily Ritual** (id: `ritual`): Shows ritual rows ("Drop 3+ thoughts" + "Sweep 3+ cards"), notification time pickers (morning default 8 AM, evening default 9 PM)
3. **Get Started** (id: `start`): "I help you think" — explains chat feature, "Tap me on any screen"

**Controls**: Skip button (top right), swipe navigation, dot indicators, "Next" / "Let's go" buttons.

**Completion** (`handleComplete()`): Calls `markOnboardingComplete()` from store, saves notification preferences, resets navigation to 'Tabs'.

**First-time detection**: `onboarding_completed_at` in `cortex_preferences` table. If null, user sees onboarding.

**Milestone markers**: `first_drop_completed_at`, `demo_sweep_completed_at`, `first_today_visit_completed_at` in `cortex_preferences`.

**Progressive unlock / feature gating**: Does NOT exist. All features are available after onboarding.

**Training mode**: Does NOT exist. No "Training Mode" label, no daily tutorials.

**Tutorial components**: `SweepDemoFlow` exists in sweep for demo mode, but no general tutorial system.

**Checklist / progress tracking**: No training checklist or progress indicator.

### Soul Document target

**7-Day Training Challenge**:
- Full app open from day one — nothing locked
- "Training Mode" label active for first 7 days
- One tutorial per day, framed as "teach your Gremly":
  - Day 1: Mind Drop
  - Day 2: Evening Sweep
  - Day 3: Morning Brief + Lock In (requires 3+ items, promotes calendar)
  - Day 4: Entity Chat ("whoa" moment)
  - Day 5: Habit Builder Chat
  - Day 6: Spaces
  - Day 7: Graduation + Weekly Summary
- Tutorials are sequential, not calendar-locked (missed = queues up)
- **Training Reference Card** behind Gremly tap (page 2 of modal): tutorials completed, what's next, "4 of 7 skills learned"
- **Graduation moment**: First weekly summary as reward, anticipation loading, push notification
- Age visually de-emphasized during week one (feeding + training primary)
- If finished early → graduate early, training mode label disappears
- If not finished by trial end → "Your Gremly has learned X of 7 skills"

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Current onboarding | Implemented | 3-step swipeable intro |
| 7-Day Training Challenge | Not implemented | No daily tutorials, no "Training Mode" label |
| Daily tutorial system | Not implemented | No tutorial prompts, no tutorial tracking |
| Training Reference Card | Not implemented | No Gremly modal, no progress card |
| Graduation moment | Not implemented | Not tied to weekly summary |
| "Teach your Gremly" framing | Not implemented | Current framing is generic app intro |
| Sequential tutorial queue | Not implemented | No tutorial state machine |
| Age de-emphasis during training | Not implemented | Age shown normally from day one |
| Demo sweep | Partial | `SweepDemoFlow` exists but not part of training sequence |
| Milestone markers | Partial | `first_drop_completed_at` etc. exist but not used as tutorial completion tracking |
| Calendar promotion on Day 3 | Not implemented | No calendar setup prompt in onboarding |

### Key files

- `app/screens/OnboardingScreen.tsx` — current 3-step onboarding
- `app/screens/SweepFlowScreen.tsx` — `SweepDemoFlow` component
- `lib/store/useGremlyStore.ts` — `markOnboardingComplete()`, milestone markers
- `navigation/RootNavigator.tsx` — onboarding → tabs navigation

### Dependencies

- Section 6 (Weekly Summary) — graduation triggers first weekly summary
- Section 1 (Age) — age de-emphasized during training
- Section 2 (Gauge) — gauge is primary experience during training
- Section 5 (Morning Brief) — Day 3 tutorial
- Section 9 (Chat) — Day 4 tutorial (Entity Chat)

---

## 13. Sock Economy

### What exists

**Sock-related code**: Minimal. Found in `components/ritual/AgeUpCelebrationModal.tsx` — a reference in age-up milestone messages. Appears to be an Easter egg mention at age 13, not a functional feature.

**No sock economy**: No sock count property, no earn/spend logic, no sock drawer, no gauge boost mechanic, no IAP integration.

### Soul Document target

**Full sock economy**:
- Single multi-purpose item ("Lucky Sock")
- **Gauge boost**: "Gremly put on their lucky sock and got a burst of energy!" — significant gauge boost
- **Wandering protection**: "Gremly had their lucky sock, so they didn't wander too far." — prevents backward aging
- **Earning**: 1 free at trial start, graduation reward, tier transitions (Sprout, Scout, Guide, etc.), milestones (100 drops, first weekly summary), special achievements
- **Purchasing**: IAP for extra boosts/protection (not required)
- **Collecting**: Accumulation over time, "sock drawer" visualization
- **Lore**: "Everyone loses socks. This is where they go. Gremly's been collecting them."

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Sock count storage | Not implemented | No property in store or DB |
| Gauge boost mechanic | Not implemented | No sock → gauge interaction |
| Wandering protection | Not implemented | No wandering exists, so no protection needed yet |
| Earning logic | Not implemented | No triggers for sock rewards |
| Spending logic | Not implemented | No spend actions |
| Sock drawer UI | Not implemented | No visualization |
| IAP integration | Not implemented | No in-app purchase for socks |
| Easter egg reference | Exists | Age 13 milestone message in AgeUpCelebrationModal |

### Key files

- `components/ritual/AgeUpCelebrationModal.tsx` — sock Easter egg reference
- (New files needed for sock economy)

### Dependencies

- Section 1 (Age/Tiers) — socks earned at tier transitions
- Section 2 (Gauge) — socks boost gauge
- Section 12 (Onboarding) — 1 free sock at trial start, graduation reward

---

## 14. Zustand Stores

### What exists

**Primary stores**:

1. **`lib/store/useGremlyStore.ts`** — `useGremlyStore` (~345.8KB)
   - The central monolith store managing: todos, habits, notes, spaces, DCO, weekly summaries, ritual progress, age, settings, onboarding state, celebration state
   - Key age/ritual properties: `gremlyAge`, `gremlyAgeLastIncrementedAt`, `todayRitualCompletedAt`, `todayDropsCount`, `todaySweepsCount`, `todayAgeCelebrationShownAt`
   - Key actions: `checkAndIncrementAge()`, `incrementDropCount()`, `incrementSweepCount()`, `ensureCurrentRitualDay()`, `handleDayRollover()`, `markOnboardingComplete()`
   - Selectors: `useCurrentWeekSummary`, `selectSummaryByWeek`, `useSpaceById`, etc.

2. **`lib/stores/mindDropStore.ts`** — `useMindDropStore`
   - State: `items`, `pendingItems`, `isLoading`, `lastFetchedAt`
   - Actions: `addPendingItem`, `confirmItem`, `updateItem`, `removeItem`, `setItems`, `hydrateFromDB`, `clearAll`

3. **`stores/userProfileStore.ts`** — `useUserProfileStore`
   - State: `profile`, `overrides`, `isLoading`, `error`
   - Actions: `fetchProfile`, `addFact`, `removeFact`, `forgetEverything`, `clearError`

4. **`lib/stores/storeSync.ts`** — sync mechanism between stores

### Soul Document target

New state properties needed for Soul Document features:

**In `useGremlyStore` (or a new dedicated store)**:
- `feedingGaugeValue: number` — current gauge level (0–100 or 0–1)
- `isFedToday: boolean` — whether gauge crossed threshold
- `fedDaysCount: number` — accumulated fed days toward next age-up (0, 1, or 2)
- `unfedStreakCount: number` — consecutive unfed days (for wandering)
- `currentTier: string` — current tier name (Hatchling, Nestling, etc.)
- `sockCount: number` — accumulated socks
- `trainingDay: number` — current training day (1–7)
- `tutorialsCompleted: string[]` — list of completed tutorial IDs
- `isTrainingMode: boolean` — whether still in training
- `aiMode: 'encouragement' | 'insightful' | 'observant'` — current AI mode
- `lastFedAt: string | null` — timestamp of last "fed" achievement

### Gap analysis

| Store | Status | Needs |
|-------|--------|-------|
| `useGremlyStore` | Exists but needs expansion | Gauge, tier, fed days, unfed streak, training, sock, AI mode properties |
| `useMindDropStore` | Complete for current needs | No changes needed |
| `useUserProfileStore` | Complete for current needs | No changes needed |
| New gauge/feeding store | Not created | Could be extracted from monolith for separation of concerns |
| New training store | Not created | Tutorial progress, training mode state |

### Key files

- `lib/store/useGremlyStore.ts` — primary store
- `lib/stores/mindDropStore.ts` — MindDrop store
- `stores/userProfileStore.ts` — user profile store
- `lib/stores/storeSync.ts` — store sync

### Dependencies

- All feature sections — store changes underpin every Soul Document feature

---

## 15. Supabase Schema

### What exists

**Key tables** (22+ tables, 70+ migrations):

- **`cortex_preferences`**: `owner_id` (PK), `tone`, `brevity`, `encouragement`, `morning_preview`, `evening_review`, `dnd`, `gremly_age`, `gremly_age_last_incremented_at`, `day_boundary_hour`, `onboarding_completed_at`, `first_drop_completed_at`, `first_today_visit_completed_at`, `demo_sweep_completed_at`, `mini_sweep_last_completed_at`, `last_sweep_completed_at`, `sweep_streak`, `routing_keywords`, `last_learned_at`, `created_at`, `updated_at`
- **`daily_ritual_progress`**: `ritual_day`, `drops_count`, `sweeps_count`, `ritual_completed_at` (per-user daily tracking)
- **`todos`**: 44+ columns — full todo management
- **`habits`**: 58+ columns — cadence, target, tracking
- **`notes`**: 40+ columns — mind drop notes
- **`spaces`**: Space management
- **`user_daily_state`**: `dco` JSONB column for DCO storage
- **`cortex_threads`**: Chat thread storage
- **`cortex_messages`**: Chat message storage

**RPC functions**:
- `check_and_increment_gremly_age` — atomic age-up check
- `increment_drop_count` — atomic drop count increment
- `increment_sweep_count` — atomic sweep count increment
- `claim_notification_slot` — notification deduplication

**Edge functions**: Not found as separate Supabase edge functions — worker logic is in Cloudflare Workers.

**Migration files**: `supabase/migrations/` — 70+ migration files

### Soul Document target

New columns/tables needed:

**`cortex_preferences` additions**:
- `current_tier text` — current tier name
- `fed_days_count integer default 0` — fed days toward next age-up (0–2)
- `unfed_streak_count integer default 0` — consecutive unfed days
- `sock_count integer default 0` — accumulated socks
- `training_day integer` — current training day
- `tutorials_completed jsonb default '[]'` — completed tutorial IDs
- `is_training_mode boolean default true` — training mode flag
- `ai_mode text default 'encouragement'` — current AI mode
- `last_fed_at timestamptz` — last "fed" timestamp

**`daily_ritual_progress` additions**:
- `feeding_gauge_value numeric default 0` — gauge value for the day
- `is_fed boolean default false` — whether gauge crossed threshold
- `gauge_breakdown jsonb` — weighted contribution breakdown

**New RPC functions**:
- `update_feeding_gauge` — atomic gauge update with weighted scoring
- `check_and_apply_wandering` — check unfed streak and apply regression
- `spend_sock` — atomic sock spend (gauge boost or wandering protection)
- `earn_sock` — atomic sock earning

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Age columns | Implemented | `gremly_age`, `gremly_age_last_incremented_at` |
| Ritual tracking | Implemented | `daily_ritual_progress` table |
| Onboarding markers | Implemented | `onboarding_completed_at`, `first_drop_completed_at`, etc. |
| Tier column | Not implemented | No `current_tier` column |
| Fed days counter | Not implemented | No `fed_days_count` column |
| Unfed streak | Not implemented | No `unfed_streak_count` column |
| Sock count | Not implemented | No `sock_count` column |
| Feeding gauge value | Not implemented | No `feeding_gauge_value` in daily progress |
| Training state | Not implemented | No `training_day`, `tutorials_completed` columns |
| AI mode | Not implemented | No `ai_mode` column |
| Gauge RPC | Not implemented | No `update_feeding_gauge` function |
| Wandering RPC | Not implemented | No `check_and_apply_wandering` function |
| Sock RPCs | Not implemented | No `spend_sock` / `earn_sock` functions |

### Key files

- `supabase/migrations/` — all migration files
- `supabase/migrations/20251021_102_cortex_prefs_lists_events.sql` — cortex_preferences base
- `lib/store/useGremlyStore.ts` — Supabase client usage patterns

### Dependencies

- All feature sections — schema changes underpin every feature

---

## 16. Cloudflare Workers

### What exists

**3 Workers**:

1. **Cortex** (`workers/cortex/`)
   - Name: `gentle-thunder-5854`
   - Purpose: AI chat, triage classification, context building
   - KV Namespace: `CONTEXT_CACHE` (2-hour TTL for DCOs)
   - Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
   - Key files: `index.js`, `triage.js`, `contextBuilder.js`, `gremlyPersona.js`, `context/dcoContext.js`
   - No cron — request-driven

2. **Notifications** (`workers/notifications/`)
   - Name: `gremly-notifications`
   - Purpose: Push notification scheduling + weekly summary generation
   - Cron: `*/5 * * * *` (every 5 minutes)
   - Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
   - Endpoints: `/test`, `/admin/weekly-summary`, `/backfill-weekly`, `/delete-summary`, `/debug-events`
   - Key file: `index.js`

3. **Inngest Jobs** (`workers/inngest-jobs/`)
   - Name: `gremly-inngest-jobs`
   - Purpose: Background job processing — DCO generation, user profile synthesis
   - Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, INNGEST_SIGNING_KEY, INNGEST_EVENT_KEY
   - Key file: `index.js`
   - No cron — event-driven via Inngest

**Calendar Worker** (separate):
- Handles OAuth flows and event fetching for Outlook/Google calendars
- Located at `workers/calendar/`

### Soul Document target

Workers need enhancements:
- **Cortex**: Tier-personality awareness in chat, AI mode in context, feeding state in context
- **Notifications**: Feeding-aware copy, "almost fed", "age-up approaching", pre/post-regression, frequency curve
- **Inngest Jobs**: DCO should include feeding state, AI mode calculation, on-demand generation for new users

Potentially new workers:
- **Wandering checker**: Could be a cron job or part of notifications worker — check for 3-day unfed streaks daily

### Gap analysis

| Worker | Status | Needs |
|--------|--------|-------|
| Cortex | Implemented | Tier personalities, AI mode awareness, feeding state in context |
| Notifications | Implemented | Feeding-aware copy, new notification types, frequency curve |
| Inngest Jobs | Implemented | AI mode calculation, on-demand DCO, feeding state in DCO |
| Calendar | Implemented | No changes needed for Soul Document |
| Wandering checker | Not implemented | New cron logic (could be in notifications worker) |

### Key files

- `workers/cortex/index.js` — Cortex worker entry
- `workers/cortex/triage.js` — chat triage
- `workers/cortex/contextBuilder.js` — context building
- `workers/cortex/gremlyPersona.js` — persona config
- `workers/cortex/context/dcoContext.js` — DCO retrieval
- `workers/notifications/index.js` — notifications worker
- `workers/inngest-jobs/index.js` — background jobs
- `workers/cortex/wrangler.toml` — Cortex config
- `workers/notifications/wrangler.toml` — Notifications config (cron schedule)
- `workers/inngest-jobs/wrangler.toml` — Inngest config

### Dependencies

- Section 7 (DCO) — Inngest generates DCOs
- Section 8 (Notifications) — Notifications worker
- Section 9 (Chat) — Cortex handles chat
- Section 2 (Feeding Gauge) — gauge state needed across workers

---

## 17. Types & Constants

### What exists

**Core type files**:
- `types/habit.ts` — Habit type with cadence, target, tracking
- `types/` directory — likely contains other shared types
- Types are often co-located with their feature code (inline in store, components)

**Constants**:
- `RitualProgressIndicator.tsx`: `REQUIRED_COUNT = 3` (drops/sweeps threshold)
- `CelebrationController.ts`: Microcopy pool, rate limits (45s), durations
- `gremlySpeech.ts`: Speech category pools, duration calc (base 3000ms + 50ms/char, max 6000ms)
- `gremlyPersona.ts`: `TEMP_TIERS = { low: 0.3, mid: 0.5, high: 0.7 }`, voice stages (NEW/BUILDING/TRUSTED)
- `TodayProgressGauges.tsx`: `GAUGE_SIZE = 88`, `STROKE_WIDTH = 9`
- `LockInPicker`: `MAX_LOCK_INS = 3`
- `triage.js`: Valid modes array, preset mapping, search levels

**No Soul Document constants**:
- No tier definitions (names, age ranges, personalities)
- No gauge thresholds or weights
- No diminishing returns curves
- No wandering window (3 days)
- No sock economy constants
- No AI mode thresholds
- No notification frequency curve parameters

### Soul Document target

New constants needed:

```typescript
// Tier definitions
const TIERS = [
  { name: 'Hatchling', minAge: 0, maxAge: 2, personality: '...' },
  { name: 'Nestling', minAge: 3, maxAge: 5, personality: '...' },
  // ... through Wizard (501+)
];

// Gauge weights
const GAUGE_WEIGHTS = {
  DROP_BASE: 0.08,      // each drop (before diminishing returns)
  SWEEP_BASE: 0.35,     // base sweep value
  SWEEP_FLOOR: 0.20,    // minimum sweep credit (1 card)
  SWEEP_JOURNAL_BONUS: 0.12,
  MORNING_BRIEF_LOCK_IN: 0.18,
  SPACE_VISIT: 0.02,
  SPACE_CREATE: 0.05,
};

// Diminishing returns
const DROP_DIMINISHING_RETURNS = { full: 5, reduced: 10, minimal: 11 };

// Gauge threshold
const FED_THRESHOLD = 0.85;  // 85% = "fed"

// Wandering
const WANDERING_WINDOW = 3;  // consecutive unfed days
const FED_DAYS_PER_AGE = 3;  // fed days to age up

// AI modes
const AI_MODE_THRESHOLDS = { ... };

// Notification frequency curve
const NOTIFICATION_CURVE = { ... };
```

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Habit types | Implemented | Full type definition |
| Chat mode constants | Implemented | 15 modes + presets + search levels |
| Celebration constants | Implemented | Microcopy, rate limits, colors |
| Ritual threshold | Implemented | `REQUIRED_COUNT = 3` |
| Tier definitions | Not implemented | No tier names, ranges, or personalities as constants |
| Gauge weights | Not implemented | No weighted scoring constants |
| Diminishing returns curve | Not implemented | No curve parameters |
| Fed threshold | Not implemented | No "fed" threshold constant |
| Wandering constants | Not implemented | No 3-day window constant |
| AI mode thresholds | Not implemented | No mode transition parameters |
| Notification curve | Not implemented | No frequency curve parameters |
| Sock economy constants | Not implemented | No sock-related constants |

### Key files

- `types/habit.ts` — Habit type
- `lib/chat/gremlyPersona.ts` — persona constants
- `workers/cortex/triage.js` — triage mode constants
- `components/ritual/RitualProgressIndicator.tsx` — `REQUIRED_COUNT`
- `app/features/celebration/CelebrationController.ts` — celebration constants
- (New file needed: `lib/constants/soulDocument.ts` or `lib/constants/tiers.ts`)

### Dependencies

- All feature sections — constants define the parameters for every system

---

## 18. Navigation & Screen Structure

### What exists

**Navigation config**:
- `navigation/RootNavigator.tsx` — root stack navigator
- `navigation/TabNavigator.tsx` — bottom tab navigator

**4 tabs**:
1. **Today** → `app/tabs/TodayScreen.tsx`
2. **MindDrop** → `app/screens/CatchAllNotepad.tsx`
3. **Spaces** → Spaces screen
4. **Hub** → Hub screen (global search)

**All routes** (30+ screens):

*Authentication*: `Login`, `Onboarding`

*Core flows*: `CatchAllNotepad`, `Sweep`, `MorningBrief`, `WeeklySummary`

*Spaces*: `SpaceDetail` (params: `{ id }`), `SpaceHome` (params: `{ spaceId, openKeyDatesModal? }`), `ChatThread` (params: `{ spaceId, chatId?, goalContext?, returnToKeyDates? }`)

*Content*: `Lists`, `ArchivedItems`, `CalendarScreen`, `Habits`, `HabitDetail`, `HabitBuilder`, `PersonDetail`

*Settings*: `Settings`, `RitualsSettings`, `TimeBlocksSettings`, `CalendarSettings`, `WhatGremlyKnows`

*Dev screens*: `DSPreview`, `DevLogin`, `RecentItems`, `DevTools`, `SweepTest`

### Soul Document target

New screens/routes needed:
- **Gremly Modal** — 2-page modal (feeding status + age/tier on page 1, training card on page 2)
- **Training Reference Card** — accessible behind Gremly tap (could be part of modal)
- **Graduation Screen** — celebration + first weekly summary reveal
- **Sock Drawer** — visualization of collected socks

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Tab navigation | Implemented | 4 tabs: Today, MindDrop, Spaces, Hub |
| Core flow screens | Implemented | Sweep, Morning Brief, Weekly Summary |
| Space screens | Implemented | SpaceHome, ChatThread, SpaceDetail |
| Settings screens | Implemented | 5 settings screens |
| Gremly Modal | Not implemented | No tappable Gremly modal |
| Training Reference Card | Not implemented | No training progress screen |
| Graduation Screen | Not implemented | No graduation celebration screen |
| Sock Drawer | Not implemented | No sock visualization screen |

### Key files

- `navigation/RootNavigator.tsx` — root navigator (all routes defined here)
- `navigation/TabNavigator.tsx` — tab navigator
- `app/tabs/TodayScreen.tsx` — Today tab
- `app/screens/CatchAllNotepad.tsx` — MindDrop tab

### Dependencies

- Section 12 (Onboarding) — graduation screen
- Section 13 (Sock Economy) — sock drawer screen
- Section 1 (Age/Tiers) — Gremly modal content

---

## 19. Home Screen / Gremly Display

### What exists

**Today screen**: `app/tabs/TodayScreen.tsx`
- Feature flags: commitments, celebrations, suggestions, evening teaser
- Multiple variants: V2, V3, V4Lanes, NowV1 (selected via env flags)
- Shows: calendar events, todos, habits, suggestions, focus list
- `TodayMascotHeader` — 72x72 mascot PNG with wave animation in top area
- Pull-to-refresh, space-based grouping
- `UnifiedCreateOverlay` for item creation
- `TodayCelebrationOverlay` on completions

**Mascot component**: `components/mascot/Mascot.tsx`
- States: idle (😌), thinking (🤔), replying (😊), playful (😉), celebration (🎉), rest (😴)
- Feature flag: `FLAG_MASCOT`, respects `FLAG_REDUCED` (reduced motion)
- Emoji fallback (Lottie commented out, awaiting animation assets)
- Size customizable (default 64px)
- Cream background with border radius

**Speech bubble**: `lib/speech/gremlySpeech.ts`
- Categories: `greeting`, `success`, `streak`, `photo`, `error`, `empty`, `returning`
- Time-of-day aware: morning, afternoon, evening, night
- Message deduplication (last 4)
- Duration: base 3000ms + 50ms/char, max 6000ms
- Personality-driven, ADHD-friendly tone

**"First daily open" detection**: Not explicitly found as a dedicated hook. The speech system has a `greeting` category that fires contextually, but no `isFirstOpenToday` boolean.

### Soul Document target

- **Feeding state indicator on Today**: Gremly expression changes based on feeding state:
  - Happy/satisfied = fed
  - Neutral = not yet
  - Sleepy = unfed yesterday
  - Or: small ring/halo around Gremly that fills
- Something **glanceable** — not a full gauge (Today is too busy)
- **Tapping Gremly** opens the modal (feeding + age + training info)
- **Speech bubble** powered by DCO context + AI mode:
  - Encouragement mode: "You've dropped 4 things today — a sweep tonight will help Gremly make sense of them."
  - Insightful mode: "Day 2 in Bora Bora. The week's rhythm can wait."
  - Observant mode: "Still here when you need me."

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Today screen | Implemented | Full daily view with todos, habits, calendar |
| Mascot display | Implemented | 72x72 PNG with wave animation |
| Speech bubbles | Implemented | Contextual, time-aware, deduplicated |
| Mascot states | Partial | 6 emoji states but not feeding-state-driven |
| Feeding state indicator | Not implemented | No gauge ring or expression change based on feeding |
| Tappable Gremly → modal | Not implemented | No Gremly modal |
| AI-mode-aware speech | Not implemented | Speech is category-based, not AI-mode-aware |
| First daily open detection | Not explicit | Greeting category exists but no dedicated hook |
| Gremly visual evolution by tier | Not implemented | Static emoji/PNG regardless of age |

### Key files

- `app/tabs/TodayScreen.tsx` — Today screen
- `components/mascot/Mascot.tsx` — mascot rendering
- `components/today/TodayMascotHeader.tsx` — mascot header on Today
- `lib/speech/gremlySpeech.ts` — speech bubble system

### Dependencies

- Section 2 (Feeding Gauge) — feeding state drives Gremly expression
- Section 7 (DCO) — DCO powers speech content
- Section 1 (Age/Tiers) — tier determines visual appearance
- Section 18 (Navigation) — modal needs to be a navigable screen

---

## 20. Celebration / Animation System

### What exists

**Celebration system**: `app/features/celebration/`

1. **`CelebrationController.ts`** — singleton manager
   - Event types: `item_created`, `todo_completed`, `habit_checkin`, `summary_refreshed`, `overlay_success`
   - 4 celebration kinds: `micro`, `confetti`, `mascot`, `age_up`
   - Rate limiting: 45s between confetti celebrations
   - Deduplication: 2s batching window for `item_created`
   - Streak milestones trigger confetti at 3, 7, 14 days
   - Haptics: Light impact for micro, success notification for confetti/mascot

2. **`CelebrationProvider.tsx`** — React provider
   - Subscribes to CelebrationController events
   - Renders `MicroCelebrate` and `ConfettiCanvas`
   - Auto-hides after 1600ms

3. **`ConfettiCanvas.tsx`** — animated confetti burst
   - React Native Reanimated
   - 50 confetti pieces with staggered animation
   - Duration: 1.4 seconds
   - Colors: `['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA']`

4. **`MicroCelebrate.tsx`** — toast notification
   - Golden Pear background (`#F4C430`)
   - Slides in from top, auto-dismisses after 1.4s
   - Microcopy rotation: `['Saved ✓', 'Nice move.', 'Locked in.', "That'll help later.", 'Progress noted.', 'Good call.']`

5. **`celebrationBus.ts`** — event bus

6. **`AgeUpCelebrationModal.tsx`** (`components/ritual/`)
   - Full-screen modal with video, haptics
   - Milestone messages for ages 1–100
   - Triggered by `checkAndIncrementAge()` success

**Animation library**: React Native Reanimated (used for confetti, gauge animations, transitions).

### Soul Document target

- **"Fed" celebration**: In-app moment when gauge crosses threshold
  - Gremly does happy/satisfied animation
  - "Gremly is fed! Day X of 3 toward your next age-up."
  - Pure positive reinforcement, no CTA
- **Tier transition celebrations**: Party modal for tier transitions (bigger than age-up)
  - Noticeable visual shift, celebratory, shareable
  - Phase 1 = rapid and exciting, Phase 2 = subtle and dignified, Phase 3 = rare and special
- **Age-up celebrations**: Continue (already exist) but framed within feeding context
- **Gauge movement animation**: Visible gauge fill on drops/sweeps
- **Gremly reaction animations**: Paired with gauge movements

### Gap analysis

| Area | Status | Detail |
|------|--------|--------|
| Micro celebrations | Implemented | Toast with microcopy rotation |
| Confetti | Implemented | 50-piece animated burst |
| Age-up modal | Implemented | Full-screen with video + milestones |
| Celebration controller | Implemented | Singleton with rate limiting, dedup |
| Haptics | Implemented | Light impact + success notification |
| Reanimated animations | Implemented | Used throughout |
| "Fed" celebration | Not implemented | No gauge-threshold celebration |
| Tier transition party modal | Not implemented | No tier system, no party modal |
| Gauge fill animation | Not implemented | No gauge to animate |
| Gremly feeding reaction | Not implemented | No feeding-state-specific animations |
| Shareable milestone cards | Not implemented | No shareable card generation |

### Key files

- `app/features/celebration/CelebrationController.ts` — celebration logic
- `app/features/celebration/CelebrationProvider.tsx` — React provider
- `app/features/celebration/ConfettiCanvas.tsx` — confetti animation
- `app/features/celebration/MicroCelebrate.tsx` — toast celebration
- `app/features/celebration/celebrationBus.ts` — event bus
- `components/ritual/AgeUpCelebrationModal.tsx` — age-up modal

### Dependencies

- Section 2 (Feeding Gauge) — "fed" celebration triggers at threshold
- Section 1 (Age/Tiers) — tier transition celebrations
- Section 13 (Sock Economy) — sock earning celebrations

---

## Summary: Priority Gap Matrix

### Not Implemented (Build from Scratch)

| Feature | Complexity | Sections |
|---------|-----------|----------|
| Feeding Gauge (core mechanic) | High | 2, 3, 4, 5, 19 |
| 11-Tier System | Medium | 1, 9 |
| Wandering Mechanic | Medium | 1, 8 |
| 7-Day Training Challenge | High | 12 |
| Sock Economy | Medium | 13 |
| AI Modes (encouragement/insightful/observant) | High | 7, 8, 9, 19 |
| Gremly Modal (2-page) | Medium | 18, 19 |
| "Fed" Celebration | Low | 20 |
| Tier Transition Party Modal | Medium | 20 |
| Notification Frequency Curve | Medium | 8 |
| Feeding-Aware Notifications (4 new types) | Medium | 8 |
| On-Demand DCO for New Users | Low | 7 |

### Partially Implemented (Needs Enhancement)

| Feature | Current State | Gap | Sections |
|---------|--------------|-----|----------|
| Age-up trigger | Binary (3 drops + 3 sweeps) | Needs gauge-threshold-based fed days | 1, 2 |
| Chat voice stages | 3 stages (NEW/BUILDING/TRUSTED) | Needs 11 tier personalities | 9 |
| Notifications | 6 types, DCO-tone-aware | Needs feeding-aware copy, new types | 8 |
| Onboarding | 3-step swipeable | Needs 7-Day Training Challenge | 12 |
| Speech bubble | Category-based, time-aware | Needs AI-mode + feeding-state awareness | 19 |
| Weekly summary notification | Exists | Needs "fed X of 7 days" | 6, 8 |
| Celebration system | 4 kinds | Needs "fed" + tier transition celebrations | 20 |
| Mascot | Static emoji/PNG | Needs tier-dependent visuals, feeding expressions | 19 |
| DCO | Two-phase pipeline, Soul Doc injection | Needs AI mode, feeding state, on-demand | 7 |
| Sweep completion | Summary + badges | Needs gauge moment + feeding-aware copy | 4 |

### Already Implemented (No Changes Needed)

| Feature | Sections |
|---------|----------|
| Drop input + classification pipeline | 3 |
| 6-step sweep flow with habits + mood | 4 |
| 5-step Morning Brief + Lock In | 5 |
| Calendar integration (Outlook/Google) | 5 |
| Weekly summary card-based flow | 6 |
| DCO two-phase generation + caching | 7 |
| 15-mode chat triage with dual classification | 9 |
| Space dashboard with AI suggestions + milestones | 10 |
| Rolling window habit streaks | 11 |
| Notification deduplication (atomic RPC) | 8 |
| Micro/confetti/age-up celebrations | 20 |
| Day rollover detection | 5 |

---

*Report covers all 20 sections specified in the analysis prompt. All findings are based on direct codebase exploration — file paths, function names, and behaviors verified against source code.*
