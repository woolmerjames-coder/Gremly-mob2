/**
 * Their own days, on the board's step in today's thread. Three cards, each
 * shown in its turn where the board's card will be:
 *
 * - KeepQuestion: Gremly asks what to do with the todos they already gave a
 *   day, with each day's load against its hours and the over-full days in
 *   red, before they answer
 * - KeepPick: they are keeping some, and tap a pin to free one for Gremly to
 *   place again
 * - OverfullCard: one day their own todos overfill, with the moves Gremly
 *   suggests for it. Nothing of theirs moves unless they take them.
 *
 * Each only draws what it is given and says what was tapped. There was no
 * mockup for these in the prototype, so they are built from the review's own
 * cards (weekStyles) and the board card's rings.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Clock, Pin, PinOff } from 'lucide-react-native';
import type { KeptTodo, ReliefMove } from '../../lib/week/board/model';
import {
  DAY_NAMES,
  WEEK_COPY,
  loadLabel,
  minsLabel,
  moveTarget,
  shortDay,
  stillLine,
} from '../../lib/week/review/words';
import { weekdayOf } from '../../lib/week/model';
import { DayRing } from './BoardCard';
import { WEEK, weekStyles } from './weekStyles';

const OVER = '#C2410C';

/** A day's load from their own todos and its habits, against its hours. */
export interface DayLoad {
  day: string;
  minutes: number;
  load: number;
  count: number;
  over: number;
}

function Said({ text }: { text: string }) {
  return (
    <View style={styles.said}>
      <View style={styles.markRow}>
        <View style={styles.mark} />
        <Text style={styles.markText}>GREMLY</Text>
      </View>
      <Text style={styles.saidText}>{text}</Text>
    </View>
  );
}

/** A ring for each day: how much of its room their own todos and its habits take. */
function LoadRings({ days }: { days: DayLoad[] }) {
  return (
    <View style={styles.rings}>
      {days.map((d) => (
        <View key={d.day} style={styles.ringCol} testID={`week-keep-day-${d.day}`}>
          <Text style={[styles.ringDay, d.over > 0 && styles.overText]}>{shortDay(d.day)}</Text>
          <DayRing
            size={36}
            fraction={d.load > 0 ? (d.minutes > 0 ? d.load / d.minutes : 1) : 0}
            ring={d.over > 0 ? OVER : WEEK.green}
            track={WEEK.soft}
            count={d.count}
            countColor={d.over > 0 ? OVER : WEEK.ink}
          />
          <Text
            style={[styles.ringLoad, d.over > 0 && styles.overText]}
            accessibilityLabel={
              d.over > 0
                ? `${DAY_NAMES[weekdayOf(d.day)]}, over by ${minsLabel(d.over)}`
                : `${DAY_NAMES[weekdayOf(d.day)]}, ${loadLabel(d.load, d.minutes)}`
            }
          >
            {d.over > 0 ? `+${minsLabel(d.over)}` : minsLabel(d.load)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function KeepQuestion({
  line,
  days,
  chosen,
  disabled,
  onKeep,
}: {
  /** Gremly's question, with the over-full days named */
  line: string;
  days: DayLoad[];
  /** What they chose before, when the question is open again to change it */
  chosen?: 'all' | 'some' | 'none';
  disabled?: boolean;
  onKeep: (choice: 'all' | 'some' | 'none') => void;
}) {
  const choices: ['all' | 'some' | 'none', string][] = [
    ['all', WEEK_COPY.keepAll],
    ['some', WEEK_COPY.keepSome],
    ['none', WEEK_COPY.keepNone],
  ];
  return (
    <View style={styles.wrap} testID="week-keep">
      <Said text={line} />
      <View style={styles.card}>
        <LoadRings days={days} />
        {choices.map(([id, label]) => {
          const main = id === (chosen ?? 'all');
          return (
            <TouchableOpacity
              key={id}
              style={[main ? weekStyles.main : weekStyles.second, disabled && weekStyles.off]}
              onPress={() => onKeep(id)}
              disabled={disabled}
              accessibilityRole="button"
              testID={`week-keep-${id}`}
            >
              <Text style={main ? weekStyles.mainText : weekStyles.secondText}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function KeepPick({
  days,
  todos,
  freed,
  disabled,
  onToggle,
  onDone,
}: {
  days: DayLoad[];
  /** Their own todos on days of the week, by day */
  todos: KeptTodo[];
  /** The ones they have freed so far */
  freed: string[];
  disabled?: boolean;
  onToggle: (todoId: string) => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.wrap} testID="week-keep-pick">
      <View style={styles.card}>
        <Text style={weekStyles.hint}>{WEEK_COPY.keepPickHint}</Text>
        {days
          .filter((d) => todos.some((t) => t.day === d.day))
          .map((d) => (
            <View key={d.day} style={styles.pickDay}>
              <View style={styles.pickHead}>
                <Text style={styles.pickName}>{DAY_NAMES[weekdayOf(d.day)]}</Text>
                <Text style={[styles.pickLoad, d.over > 0 && styles.overText]}>
                  {loadLabel(d.load, d.minutes)}
                </Text>
              </View>
              {todos
                .filter((t) => t.day === d.day)
                .map((t) => {
                  const off = freed.includes(t.id);
                  const Icon = off ? PinOff : Pin;
                  return (
                    <View key={t.id} style={styles.pickRow}>
                      <View style={styles.pickWords}>
                        <Text style={[styles.pickTitle, off && styles.pickTitleOff]}>
                          {t.title}
                        </Text>
                        <Text style={styles.pickMins}>
                          {t.timed
                            ? `${minsLabel(t.minutes)} · ${WEEK_COPY.keepTimed}`
                            : minsLabel(t.minutes)}
                        </Text>
                      </View>
                      {t.timed ? (
                        // it has a time of day, so it stays on its day
                        <Clock size={18} color={WEEK.faint} strokeWidth={2.2} />
                      ) : (
                        <TouchableOpacity
                          style={[styles.pin, off && styles.pinOff]}
                          onPress={() => onToggle(t.id)}
                          disabled={disabled}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityState={{ selected: !off }}
                          accessibilityLabel={
                            off ? `${t.title}, freed. Keep it` : `${t.title}, kept. Free it`
                          }
                          testID={`week-keep-pin-${t.id}`}
                        >
                          <Icon size={16} color={off ? WEEK.muted : WEEK.linen} strokeWidth={2.4} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
            </View>
          ))}
        <TouchableOpacity
          style={[weekStyles.main, disabled && weekStyles.off]}
          onPress={onDone}
          disabled={disabled}
          accessibilityRole="button"
          testID="week-keep-pick-done"
        >
          <Text style={weekStyles.mainText}>{WEEK_COPY.keepPickDone}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function OverfullCard({
  day,
  line,
  today,
  fitting,
  moves,
  note,
  still,
  none,
  disabled,
  onTake,
  onChange,
  onLeave,
}: {
  day: string;
  /** Gremly's line: the day and how far over it is */
  line: string;
  today: string;
  /** The suggestions are still being worked out */
  fitting: boolean;
  moves: ReliefMove[];
  /** Gremly's few words about why these */
  note: string;
  /** How far over the day would still be with every move taken */
  still: number;
  /** Said when there are no moves to offer */
  none: string;
  disabled?: boolean;
  onTake: () => void;
  onChange: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.wrap} testID={`week-overfull-${day}`}>
      <Said text={line} />
      {fitting ? (
        <View style={[weekStyles.card, styles.fitting]} testID="week-overfull-fitting">
          <Text style={[styles.title, weekStyles.grow]}>{WEEK_COPY.overfullFitting}</Text>
          <ActivityIndicator color={WEEK.green} />
        </View>
      ) : (
        <View style={[styles.card, styles.overCard]}>
          {moves.length ? (
            <>
              {moves.map((m) => (
                <View key={m.id} style={styles.move} testID={`week-overfull-move-${m.id}`}>
                  <View style={styles.pickWords}>
                    <Text style={styles.pickTitle}>{m.title}</Text>
                    <Text style={styles.pickMins}>{minsLabel(m.minutes)}</Text>
                  </View>
                  <ArrowRight size={14} color={WEEK.muted} strokeWidth={2.4} />
                  <Text style={styles.target}>{moveTarget(m.to, m.backOn, today)}</Text>
                </View>
              ))}
              {note ? <Text style={styles.note}>{note}</Text> : null}
              {still > 0 ? <Text style={weekStyles.hint}>{stillLine(still)}</Text> : null}
              <TouchableOpacity
                style={[weekStyles.main, disabled && weekStyles.off]}
                onPress={onTake}
                disabled={disabled}
                accessibilityRole="button"
                testID="week-overfull-take"
              >
                <Text style={weekStyles.mainText}>{WEEK_COPY.takeMoves}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.noneText}>{none}</Text>
          )}
          <View style={weekStyles.pair}>
            <TouchableOpacity
              style={[weekStyles.second, weekStyles.grow, disabled && weekStyles.off]}
              onPress={onChange}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-overfull-change"
            >
              <Text style={weekStyles.secondText}>{WEEK_COPY.changeMyself}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[weekStyles.second, weekStyles.grow, disabled && weekStyles.off]}
              onPress={onLeave}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-overfull-leave"
            >
              <Text style={weekStyles.secondText}>{WEEK_COPY.leaveIt}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * A todo that matters most this week and is on no day of it: Gremly says so,
 * and offers to put it on the day with room for it, to split it into parts
 * that each fit a day, or to leave it for later. With neither to offer, the
 * board is theirs to make room on.
 */
export function FitCard({
  id,
  line,
  dayLabel,
  splitLabel,
  partsLine,
  disabled,
  onDay,
  onSplit,
  onOpen,
  onLeave,
}: {
  id: string;
  /** Gremly's line: the todo, and that it is on no day */
  line: string;
  /** "Put it on Saturday", when a day has room for it whole */
  dayLabel: string | null;
  /** "Split it in two", when it can be split to fit, with the parts and their days under it */
  splitLabel: string | null;
  partsLine: string;
  disabled?: boolean;
  onDay: () => void;
  onSplit: () => void;
  onOpen: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.wrap} testID={`week-fit-${id}`}>
      <Said text={line} />
      <View style={[styles.card, styles.overCard]}>
        {dayLabel ? (
          <TouchableOpacity
            style={[weekStyles.main, disabled && weekStyles.off]}
            onPress={onDay}
            disabled={disabled}
            accessibilityRole="button"
            testID="week-fit-day"
          >
            <Text style={weekStyles.mainText}>{dayLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {splitLabel ? (
          <>
            <TouchableOpacity
              style={[dayLabel ? weekStyles.second : weekStyles.main, disabled && weekStyles.off]}
              onPress={onSplit}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-fit-split"
            >
              <Text style={dayLabel ? weekStyles.secondText : weekStyles.mainText}>
                {splitLabel}
              </Text>
            </TouchableOpacity>
            <Text style={weekStyles.hint}>{partsLine}</Text>
          </>
        ) : null}
        {!dayLabel && !splitLabel ? <Text style={styles.noneText}>{WEEK_COPY.fitNone}</Text> : null}
        <View style={weekStyles.pair}>
          <TouchableOpacity
            style={[weekStyles.second, weekStyles.grow, disabled && weekStyles.off]}
            onPress={onOpen}
            disabled={disabled}
            accessibilityRole="button"
            testID="week-fit-open"
          >
            <Text style={weekStyles.secondText}>{WEEK_COPY.fitOpen}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[weekStyles.second, weekStyles.grow, disabled && weekStyles.off]}
            onPress={onLeave}
            disabled={disabled}
            accessibilityRole="button"
            testID="week-fit-leave"
          >
            <Text style={weekStyles.secondText}>{WEEK_COPY.fitLeave}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  said: { alignSelf: 'flex-start', maxWidth: 340, gap: 6 },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: {
    width: 8,
    height: 8,
    borderRadius: 1.5,
    backgroundColor: '#9CA6E0',
    transform: [{ rotate: '45deg' }],
  },
  markText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.6,
    color: 'rgba(46,85,64,0.55)',
  },
  saidText: { fontFamily: 'Inter-Regular', fontSize: 16, lineHeight: 25, color: '#1F1F1F' },
  card: {
    backgroundColor: WEEK.white,
    borderRadius: 20,
    padding: 14,
    gap: 10,
    borderWidth: 1.5,
    borderColor: WEEK.green,
  },
  overCard: { borderColor: OVER },
  rings: { flexDirection: 'row', gap: 4, marginBottom: 2 },
  ringCol: { flex: 1, alignItems: 'center', gap: 4 },
  ringDay: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: WEEK.muted },
  ringLoad: { fontFamily: 'Inter-SemiBold', fontSize: 10, color: WEEK.muted },
  overText: { color: OVER },
  pickDay: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1ECE3' },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickName: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: WEEK.ink },
  pickLoad: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: WEEK.green },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickWords: { flex: 1, gap: 1 },
  pickTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, lineHeight: 19, color: WEEK.ink },
  pickTitleOff: { color: WEEK.muted },
  pickMins: { fontFamily: 'Inter-Regular', fontSize: 12, color: WEEK.muted },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WEEK.green,
  },
  pinOff: { backgroundColor: WEEK.linen2 },
  fitting: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
  move: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  target: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: WEEK.green },
  note: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    lineHeight: 17,
    color: WEEK.amberDark,
    backgroundColor: WEEK.amberWash,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  noneText: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: WEEK.ink },
});
