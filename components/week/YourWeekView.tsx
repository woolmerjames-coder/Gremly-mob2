/**
 * Your week, drawn: the intention and what matters most as the review kept
 * them, each day with what was planned for it and how it went, what is
 * waiting in Later, and the ways on from here (change the week by hand, plan
 * more of it, go back to the conversation).
 *
 * It only draws the week it is given (lib/week/yourWeek.ts) and says what was
 * tapped. There was no mockup for this screen in the prototype, so it is
 * built from the review's own cards (weekStyles).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  MessageCircle,
  Star,
  X,
} from 'lucide-react-native';
import type { WeekDayView, WeekTodoRow, YourWeek } from '../../lib/week/yourWeek';
import {
  WEEK_COPY,
  dayTally,
  intentionQuote,
  laterLine,
  todoStateLabel,
  weekDayLabel,
} from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';

export interface YourWeekViewProps {
  week: YourWeek;
  today: string;
  /** What was just saved or taken back, with its Undo while it can be undone */
  notice?: { text: string; onUndo?: (() => void) | null } | null;
  /** Another go at planning that can be started from here, when there is one */
  planMore?: { label: string; onPress: () => void } | null;
  busy?: boolean;
  onChange: () => void;
  /** Back to where the review happened, when that thread can be opened */
  onConversation?: (() => void) | null;
}

function Mark({ state }: { state: WeekTodoRow['state'] }) {
  if (state === 'done') {
    return (
      <View style={[styles.mark, styles.markDone]}>
        <Check size={12} color={WEEK.linen} strokeWidth={3.2} />
      </View>
    );
  }
  if (state === 'moved') {
    return (
      <View style={[styles.mark, styles.markQuiet]}>
        <ArrowRight size={12} color={WEEK.muted} strokeWidth={2.6} />
      </View>
    );
  }
  if (state === 'later') {
    return (
      <View style={[styles.mark, styles.markQuiet]}>
        <Clock size={12} color={WEEK.muted} strokeWidth={2.6} />
      </View>
    );
  }
  if (state === 'let_go') {
    return (
      <View style={[styles.mark, styles.markQuiet]}>
        <X size={12} color={WEEK.muted} strokeWidth={2.6} />
      </View>
    );
  }
  return <View style={[styles.mark, styles.markOpen]} />;
}

function Day({
  d,
  week,
  today,
  open,
  onToggle,
}: {
  d: WeekDayView;
  week: YourWeek;
  today: string;
  open: boolean;
  onToggle: () => void;
}) {
  const empty = !d.todos.length && !d.habits.length;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={[styles.day, d.when === 'today' && styles.dayToday]} testID={`your-week-${d.day}`}>
      <TouchableOpacity
        style={styles.dayHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID={`your-week-day-${d.day}`}
      >
        <Text style={styles.dayName}>{weekDayLabel(d.day, today)}</Text>
        <Text style={styles.dayTally}>{dayTally(d)}</Text>
        <Chevron size={16} color={WEEK.faint} strokeWidth={2.4} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.rows}>
          {empty ? (
            <Text style={weekStyles.hint}>
              {d.when === 'past' ? WEEK_COPY.weekNothing : WEEK_COPY.nothingOnDay}
            </Text>
          ) : null}
          {d.habits.map((h) => (
            <View key={`h-${h.id}`} style={styles.row}>
              {h.done ? <Mark state="done" /> : <View style={[styles.mark, styles.markHabit]} />}
              <Text style={styles.rowTitle}>{h.title}</Text>
              {!h.done && d.when === 'past' ? (
                <Text style={styles.rowState}>{WEEK_COPY.notDone}</Text>
              ) : null}
            </View>
          ))}
          {d.todos.map((t) => {
            const label = todoStateLabel(t, d.when, week.first, week.last, today);
            const faded = t.state === 'moved' || t.state === 'later' || t.state === 'let_go';
            return (
              <View key={`t-${t.id}`} style={styles.row}>
                <Mark state={t.state} />
                <Text style={[styles.rowTitle, faded && styles.rowTitleFaded]}>{t.title}</Text>
                {label ? <Text style={styles.rowState}>{label}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function YourWeekView(p: YourWeekViewProps) {
  const { week, today } = p;
  // today's day is open to begin with; on a day outside the week, its first
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const at = week.days.find((d) => d.day === today) ?? week.days[0];
    return at ? { [at.day]: true } : {};
  });
  return (
    <View style={styles.wrap} testID="your-week">
      {week.intention ? (
        <View style={weekStyles.dark}>
          <Text style={weekStyles.darkKicker}>{WEEK_COPY.weekIntention}</Text>
          <Text style={styles.intention}>{intentionQuote(week.intention)}</Text>
        </View>
      ) : null}

      {week.priorities.length ? (
        <View style={weekStyles.card}>
          <Text style={styles.section}>{WEEK_COPY.weekPriorities}</Text>
          {week.priorities.map((text, i) => (
            <View key={i} style={styles.priority}>
              <Star size={14} color={WEEK.amberDeep} fill={WEEK.amberDeep} />
              <Text style={styles.priorityText}>{text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>{WEEK_COPY.weekDays}</Text>
      {week.days.map((d) => (
        <Day
          key={d.day}
          d={d}
          week={week}
          today={today}
          open={!!open[d.day]}
          onToggle={() => setOpen((o) => ({ ...o, [d.day]: !o[d.day] }))}
        />
      ))}

      <View style={[weekStyles.card, styles.later]}>
        <Clock size={16} color={WEEK.green} strokeWidth={2.4} />
        <Text style={styles.laterText}>{laterLine(week.later.count, week.later.next, today)}</Text>
      </View>

      {/* beside the button that made it, so it is seen where they are looking */}
      {p.notice ? (
        <View style={[weekStyles.card, styles.notice]} testID="your-week-notice">
          <Text style={styles.noticeText}>{p.notice.text}</Text>
          {p.notice.onUndo ? (
            <TouchableOpacity
              style={weekStyles.link}
              onPress={p.notice.onUndo}
              disabled={p.busy}
              accessibilityRole="button"
              testID="your-week-undo"
            >
              <Text style={weekStyles.linkText}>{WEEK_COPY.boardUndo}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity
        style={[weekStyles.main, p.busy && weekStyles.off]}
        onPress={p.onChange}
        disabled={p.busy}
        accessibilityRole="button"
        testID="your-week-change"
      >
        <Text style={weekStyles.mainText}>{WEEK_COPY.changeWeek}</Text>
      </TouchableOpacity>
      {p.planMore ? (
        <TouchableOpacity
          style={[weekStyles.second, p.busy && weekStyles.off]}
          onPress={p.planMore.onPress}
          disabled={p.busy}
          accessibilityRole="button"
          testID="your-week-plan-more"
        >
          <Text style={weekStyles.secondText}>{p.planMore.label}</Text>
        </TouchableOpacity>
      ) : null}
      {p.onConversation ? (
        <TouchableOpacity
          style={styles.conversation}
          onPress={p.onConversation}
          accessibilityRole="button"
          testID="your-week-conversation"
        >
          <MessageCircle size={15} color={WEEK.green} strokeWidth={2.4} />
          <Text style={weekStyles.linkText}>{WEEK_COPY.openConversation}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  intention: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 19,
    lineHeight: 25,
    color: WEEK.linen,
  },
  section: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: WEEK.muted, marginTop: 4 },
  priority: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priorityText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 15, color: WEEK.ink },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: WEEK.ink,
  },
  day: { backgroundColor: WEEK.white, borderRadius: 16, paddingHorizontal: 14 },
  dayToday: { borderWidth: 1.5, borderColor: WEEK.green },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  dayName: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
  dayTally: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: WEEK.muted },
  rows: { gap: 10, paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 20, color: WEEK.ink },
  rowTitleFaded: { color: WEEK.muted },
  rowState: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: WEEK.muted },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: { backgroundColor: WEEK.green },
  markQuiet: { backgroundColor: WEEK.linen2 },
  markOpen: { borderWidth: 1.5, borderColor: WEEK.line },
  markHabit: { borderWidth: 1.5, borderColor: '#4F8A5F', borderStyle: 'dashed' },
  later: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  laterText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: WEEK.ink,
  },
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 8,
  },
});
