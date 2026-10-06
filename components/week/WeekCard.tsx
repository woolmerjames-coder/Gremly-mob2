/**
 * One of the weekly review's cards in today's thread, drawn by which card it
 * is (lib/brief/types.ts WeekCardMeta). The step cards draw from the review's
 * row as the session holds it (lib/week/review/session), so they are always
 * the week as it stands; the review's own newest card for a step is the one
 * that can be acted on, and any other copy only shows what was settled on it.
 * The opening and the summary draw from what the card itself keeps, so a
 * thread read back on a later day still shows them.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { WeekCardMeta } from '../../lib/brief/types';
import { getDateService } from '../../lib/date/DateService';
import type { WeekReview } from '../../lib/week/useWeekReview';
import { useWeekSession } from '../../lib/week/review/session';
import {
  TIMELINE_MAX,
  dateKey,
  daysPlanned,
  hoursTotal,
  isPast,
  isWeekend,
  milestonesShown,
  stepOf,
  type ChatStep,
} from '../../lib/week/review/state';
import {
  DAY_NAMES,
  WEEK_COPY,
  dayLetter,
  hoursLabel,
  intentionQuote,
  shortDate,
  shortDay,
  stepWhen,
  whenLabel,
} from '../../lib/week/review/words';
import { dayKind, weekdayOf, type DayKind } from '../../lib/week/model';
import { useThisWeek } from '../../lib/week/thisWeek';
import { ChallengeCard } from './ChallengeCard';
import { IntentionCard } from './IntentionCard';
import { MilestoneCards } from './MilestoneCard';
import { NeedsYouDeck } from './NeedsYouDeck';
import { PriorityChips } from './PriorityChips';
import { ShapeCard } from './ShapeCard';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const CAPTAIN_GREMLY = WEEK_MASCOTS.captain;
const CHEERING_GREMLY = WEEK_MASCOTS.cheering;

const sameDays = (x: string[], y: string[]) =>
  x.length === y.length && [...x].sort().join() === [...y].sort().join();

/** What they settled on a card, as their own message under it. */
function Settled({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <View style={weekStyles.bubble} testID="week-settled">
      <Text style={weekStyles.bubbleText}>{text}</Text>
    </View>
  );
}

/** The review's mark, with when it was opened. */
function Opening({ at }: { at?: string }) {
  return (
    <View style={styles.opening} testID="week-opening">
      <Image
        source={CAPTAIN_GREMLY}
        style={styles.captain}
        accessibilityLabel="Gremly in a captain's cap with a whistle"
      />
      <Text style={styles.kicker}>{WEEK_COPY.kicker}</Text>
      {at ? <Text style={weekStyles.hint}>{at}</Text> : null}
    </View>
  );
}

/** The week in short: the intention, and three counts. */
function Done({ summary, recap }: { summary: WeekCardMeta['summary']; recap?: boolean }) {
  if (!summary) return null;
  return (
    <View testID="week-done">
      {recap ? null : (
        <Image source={CHEERING_GREMLY} style={styles.cheer} accessibilityLabel="Gremly cheering" />
      )}
      <View style={[weekStyles.dark, styles.done]}>
        <Text style={weekStyles.darkKicker}>{WEEK_COPY.doneKicker}</Text>
        {summary.intention ? (
          <Text style={styles.intention}>{intentionQuote(summary.intention)}</Text>
        ) : null}
        <View style={styles.tiles}>
          {summary.tiles.map((t, i) => (
            <View key={i} style={styles.tile}>
              <Text style={styles.tileNum}>{t.num}</Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export interface WeekCardProps {
  messageId: string;
  meta: WeekCardMeta;
  review: WeekReview;
}

export function WeekCard({ messageId, meta, review }: WeekCardProps) {
  const s = useWeekSession();
  const daysOff = useThisWeek((w) => w.daysOff);
  if (meta.card === 'opening') return <Opening at={meta.at} />;
  if (meta.card === 'done') return <Done summary={meta.summary} recap={meta.recap} />;

  const step = meta.card as ChatStep;
  const row = s.row;
  const read = row?.read ?? null;
  // another week's card, a copy the review has moved on from, or a thread
  // read back before its week is in hand: only what was settled on it shows
  if (!row || !read || !s.on || !s.draft || !review.isLive(meta, messageId)) {
    return <Settled text={meta.settled} />;
  }

  const at = stepOf(row);
  const under = row.status === 'started';
  const editing = under && s.editing === step;
  const editable = under && (at === step || editing);
  const locked = under && isPast(step, at) && !editing;
  const disabled = review.busy;
  const today = getDateService().ritualDay();
  const days = daysPlanned(s.on);
  const first = s.on.span_start;
  const last = s.on.span_end;
  const a = row.answers;
  const d = s.draft;
  const common = {
    editable,
    editing,
    locked,
    disabled,
    onChange: () => review.edit(step),
    onJustPlan: () => void review.justPlan(),
  };

  let body: React.ReactNode = null;
  switch (step) {
    case 'challenge':
      body = (
        <ChallengeCard
          headline={read.challenge?.headline ?? ''}
          why={read.challenge?.why}
          evidence={read.evidence ?? []}
          comingOff={read.coming_off}
          comingUp={(read.coming_up ?? [])
            .filter((c) => c.when >= today)
            .slice(0, TIMELINE_MAX)
            .map((c) => ({ when: whenLabel(c.when, first, last), what: c.what }))}
          added={a.challenge?.note ?? null}
          // once they have said not quite, the card waits for their words, not a tap
          asking={editable && !s.fixing}
          disabled={disabled}
          onAgree={() => void review.challenge.agree()}
          onDisagree={() => void review.challenge.disagree()}
          onJustPlan={common.onJustPlan}
        />
      );
      break;
    case 'priorities': {
      const options = read.priority_options ?? [];
      // settled: what the row keeps; being picked: what the card holds
      const picked = editable
        ? d.priorities
        : (a.priorities ?? [])
            .map((p) => options.findIndex((o) => o.text === p.text))
            .filter((i) => i >= 0);
      body = (
        <PriorityChips
          options={options.map((o) => ({ text: o.text, star: !!o.gremly_pick }))}
          picked={picked}
          onToggle={review.priorities.toggle}
          onDone={() => void review.priorities.done()}
          {...common}
        />
      );
      break;
    }
    case 'shape': {
      const busy = editable ? d.busy : (a.busy_days ?? []).filter((x) => days.includes(x));
      const hours = editable ? d.hours : { ...d.hours, ...(a.hours ?? {}) };
      const out = editable ? d.datesOut : (a.dates_out ?? []);
      const kindOf = (day: string) => dayKind(day, { daysOff, busyDays: busy });
      const list = (kind: DayKind, none: string) =>
        days
          .filter((x) => kindOf(x) === kind)
          .map(shortDay)
          .join(', ') || none;
      // Gremly's own busy days, among the days being planned
      const guessed = (read.busy_days ?? []).filter((x) => days.includes(x));
      const guess = read.free_hours_guess;
      const isGuess =
        !!guess &&
        guess.normal_day === hours.normal_day &&
        guess.busy_day === hours.busy_day &&
        guess.weekend_day === hours.weekend_day;
      body = (
        <ShapeCard
          dates={(read.coming_up ?? [])
            .map((c, i) => ({ c, key: dateKey(c, i) }))
            .filter(({ c, key }) => c.when >= today && !out.includes(key))
            .map(({ c, key }) => ({ key, when: whenLabel(c.when, first, last), what: c.what }))}
          days={days.map((day) => ({
            day,
            letter: dayLetter(day),
            name: DAY_NAMES[weekdayOf(day)],
            busy: busy.includes(day),
          }))}
          busyNote={
            a.busy_days || !sameDays(busy, guessed) ? WEEK_COPY.busySet : WEEK_COPY.busyGuess
          }
          hours={[
            {
              kind: 'normal_day',
              title: WEEK_COPY.normalDay,
              days: list('normal_day', WEEK_COPY.noneThisWeek),
              value: hoursLabel(hours.normal_day),
            },
            {
              kind: 'busy_day',
              title: WEEK_COPY.busyDay,
              days: list('busy_day', WEEK_COPY.markBusy),
              value: hoursLabel(hours.busy_day),
            },
            {
              kind: 'weekend_day',
              title: isWeekend(daysOff) ? WEEK_COPY.weekendDay : WEEK_COPY.dayOff,
              days: list('weekend_day', WEEK_COPY.noneThisWeek),
              value: hoursLabel(hours.weekend_day),
            },
          ]}
          total={`About ${hoursLabel(hoursTotal(days, hours, busy, daysOff))} this week`}
          reason={isGuess ? guess?.reason : null}
          onRemoveDate={review.shape.removeDate}
          onAddDate={(text) => void review.shape.addDate(text)}
          onToggleBusy={review.shape.toggleBusy}
          onStepHours={review.shape.stepHours}
          onDone={() => void review.shape.done()}
          {...common}
        />
      );
      break;
    }
    case 'intention': {
      const drafts = read.intention_drafts ?? [];
      const kept = (a.intention ?? '').trim();
      const keptAt = drafts.findIndex((x) => x.trim() === kept);
      body = (
        <IntentionCard
          drafts={drafts}
          picked={editable ? d.intention.pick : keptAt >= 0 ? keptAt : null}
          own={editable ? d.intention.own : keptAt >= 0 ? '' : kept}
          onPick={review.intention.pick}
          onWrite={review.intention.write}
          onDone={() => void review.intention.done()}
          {...common}
        />
      );
      break;
    }
    case 'ahead': {
      const set = new Map((a.milestones ?? []).map((m) => [m.about, m]));
      body = (
        <MilestoneCards
          milestones={milestonesShown(read, today).map((m) => ({
            key: m.key,
            goal: m.goal,
            when: shortDate(m.date),
            steps: m.steps.map((x, i) => ({
              when: stepWhen(x.by),
              title: x.title,
              check: x.kind === 'check_in',
              kept: !(d.stepsOut[m.key] ?? []).includes(i),
            })),
            setUp: set.has(m.key),
            canUndo: !!s.undoable[`milestone:${m.key}`],
          }))}
          onToggleStep={review.ahead.toggleStep}
          onSetUp={(key) => void review.ahead.setUp(key)}
          onUndo={(key) => void review.ahead.undo(key)}
          onDone={() => void review.ahead.done()}
          {...common}
        />
      );
      break;
    }
    case 'needs_you': {
      const decided = new Map((a.needs_you ?? []).map((n) => [n.title, n.decision]));
      body = (
        <NeedsYouDeck
          cards={(read.needs_you ?? []).map((n) => ({
            title: n.title,
            why: n.stuck_because,
            status: decided.get(n.title) ?? null,
          }))}
          talking={s.talking}
          editable={editable}
          disabled={disabled}
          onTalk={(i) => void review.needsYou.talk(i)}
          onDone={() => void review.needsYou.done()}
          onJustPlan={common.onJustPlan}
        />
      );
      break;
    }
  }
  return (
    <View>
      {body}
      <Settled text={meta.settled} />
    </View>
  );
}

const styles = StyleSheet.create({
  opening: { alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 6 },
  captain: { width: 116, height: 116 },
  kicker: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 0.9,
    color: WEEK.green,
  },
  cheer: { alignSelf: 'center', width: 120, height: 120, marginBottom: 6 },
  done: { gap: 12 },
  intention: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 19,
    lineHeight: 25,
    color: WEEK.linen,
  },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: WEEK.darkTile, borderRadius: 14, padding: 10, gap: 2 },
  tileNum: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 22, color: WEEK.amber },
  tileLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 15, color: WEEK.darkText },
});
