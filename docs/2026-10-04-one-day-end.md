# One day end for the whole app

4 October 2026, branch `sweep-updates-10.04`.

## What changed

A person's day ends at their day end (3 AM unless they chose otherwise in
Rituals settings), not at midnight. Until now only some parts of the app
counted that way: today's thread, feeding and the evening wrap up. Everything
else read the date from the clock, so between midnight and the day end the app
had two ideas of today.

Now there is one. `getDateService().today()` is the person's day everywhere:
at 12:30 AM on Thursday it is still Wednesday, and tomorrow is Thursday. Before
midnight nothing changes at all.

## The rules, for new code

All in `lib/date/DateService.ts`.

| You want                                                                                      | Use                                                                                                                  |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Today's date                                                                                  | `today()`. Also `tomorrow()`, `yesterday()`, `isToday(day)`, `getStartOfWeek()`, `getDayOfWeek()`: all count from it |
| The day something happened (made, done, skipped, logged)                                      | `dayOf(moment)`, then compare with `today()`. `isTimestampToday(moment)` does both                                   |
| A Date to read the date from (its weekday, month, a start of today, tomorrow counted from it) | `dayNow()`                                                                                                           |
| Is this day today, for a Date that stands for a day                                           | `isToday`, `isTomorrow`, `isPast`, `isFuture` from `lib/date/dayCompare.ts`, not from date-fns                       |
| When the day started, as a moment                                                             | `startOfRitualDay()`, or `startOfDayUtc(day)` and `endOfDayUtc(day)` for a query                                     |
| How far into the day it is, for what is still ahead today                                     | `minutesIntoDay()`                                                                                                   |
| The time of day, or how long ago something was                                                | `now()`, as before                                                                                                   |
| The date on the clock, whatever the day end                                                   | `calendarDay()`. Rarely right for a screen                                                                           |

`extractLocalDate(value)` still turns a stored date into a day without moving
it. Use it for due dates and other values that are days. For a moment, use
`dayOf`.

Tests run with the day ending at midnight unless a test sets its own
(`__tests__/setup/dayEnd.ts`), so no test depends on the hour it runs at.

## What was changed, by kind

**The service itself.** `today()` and everything built on it. `ritualDay()` is
now the same as `today()`. `startOfDayUtc`, `endOfDayUtc` and
`startOfRitualDay` follow the day end and the person's time zone (they used
the phone's time zone before). Date words ("tomorrow", "friday", "next week")
count from the person's day. The service keeps its clock readers instead of
making a new one on every call.

**The day something happened** now uses `dayOf`: todos done today, drops made
today, notes and journals by day, cards skipped in Sweep today, the last habit
check in, the last Sweep, chat history groups, the Hub timeline and item dates,
space chat dates, person item dates.
Files: `lib/store/selectors.ts`, `lib/sweep/engine.ts`,
`lib/today/hooks/useTodayEntries.ts`, `lib/today/hooks/useMiniSweepGate.ts`,
`lib/habits/habitInsight.ts`, `lib/habits/habitCardStats.ts`,
`lib/plan/storePlan.ts`, `lib/utils/getRelativeTime.ts`,
`lib/hub/hubHelpers.ts`, `app/tabs/HubScreen.tsx`,
`app/spaces/SpaceHomeScreen.tsx`, `app/screens/HabitsScreen.tsx`,
`app/screens/NowScreenV1.tsx`, `app/people/PersonDetailScreen.tsx`,
`components/chat/ChatHistorySheet.tsx`, `components/now/NowWeekPopup.tsx`,
`components/now/YourNotesRow.tsx`, `components/now/JournalFullScreen.tsx`,
`components/overlay/mappers.ts`, `components/hub/TimelineView.tsx`,
`app/components/sweep/SweepIntentionStep.tsx`.

**A date read from the clock** now reads the person's day (`dayNow()`,
`today()` or `startOfRitualDay()`):

- Today: the header date, what is still ahead today, the next event banner,
  the day's progress sheet, event rows and key date cards, the habit week
  strip, weekly habits by weekday.
- Drop: today's counts, the Today, Tomorrow, weekend and Monday chips, the
  weekday sent with a drop.
- Item sheet: the Today and Tomorrow buttons, the date label, the day picker's
  starting day, a habit's start date, a journal's date.
- Cards and labels: due labels on item cards (Today, Tomorrow, Overdue), the
  toast's weekday, key dates and journeys in spaces.
- Habits: the habits screen week, habit detail calendars and weeks, habit
  cards.
- Journal: which day it opens on and how far forward it can go.
- Weekly Summary: Tomorrow, Next Week and In 2 Weeks.
- Worlds and chapters: this week, day counts, days to an end date.
- The planner: today, now and what room is left (done in the Lock In commit).

**Left on the clock on purpose.** Reminders (a reminder is a moment). Time of
day greetings and day parts. Rolling windows counted in hours (the last 3 days,
the last 7 days, the last 30 days). How long ago something was, in minutes and
hours. Date and time pickers' minimum dates. Calendar events stay keyed by the
date they start on, so a meeting at 12:30 AM on Thursday is Thursday's, and is
not shown on Wednesday's Today.

**Not changed.**

- Gremly's side, apart from Ask Gremly (done on 4 Oct, `1048214b`): the
  background reader, the daily context job and the day turn's worker still
  read the date their own way. It is row 8 of `docs/agent/SWEEP_STEP10.md`.
  The date words built in the app for the older chat prompts
  (`lib/chat/gremlyPersona.ts`, `lib/chat/buildBirthdayContext.ts`) are left
  as they were for the same reason: they are what Gremly is told.
- The older Today screens behind their flags, and the code only they use
  (`lib/now/useNowData.ts`, `lib/today/useTodayData.ts`,
  `app/screens/CalendarScreen.old.tsx`). They follow the person's day wherever
  they ask the service for today; their own clock reads were changed only
  where it was one word.
- `lib/store/worldsSelectors.ts` keeps a few week keys built from UTC dates
  (`toISOString().slice(0, 10)`). They were like that before and can be a day
  out near midnight UTC. Not part of this change.

## What to check on a phone

Set the phone's clock to 12:30 AM (or stay up). With the day end at 3 AM:

1. Today still shows yesterday's date and yesterday's list. A todo ticked off
   now counts for that day.
2. Log a habit: it is logged for the day that is ending, and the habit is not
   already done when the next day starts.
3. Drop "call mum tomorrow": it is dated the day the clock already shows.
4. The item sheet's Today and Tomorrow buttons set the day that is ending and
   the day after it.
5. The wrap up, its cards and Plan tomorrow all agree with Today.
6. At 3:00 AM everything turns over together: Today, the thread, the habits.
7. Change the day end in Rituals settings to midnight: everything follows the
   clock again.
