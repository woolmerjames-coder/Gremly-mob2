/**
 * The week's board: a full sheet over today's thread, with three tabs. Days
 * has a ring for each day's room and a panel for the day picked, where a todo
 * can be moved to any day or to Later and one from Later added. Habits has a
 * toggle for each day of each habit, and under them the two ways to ease one
 * for the week: pause it, or do a lighter version. Later shows everything put off with the
 * day it comes back, and a tap gives one a day this week instead.
 *
 * It only draws the board it is given (lib/week/board/model.ts) and says what
 * was tapped: nothing is saved until Done. To the approved prototype (Weekly
 * sweep prototype, "Plan your week").
 *
 * The arrow in its header is the way back without finishing. The prototype
 * has only Done there; on a phone with no back button that left no way to
 * the thread, to ask Gremly something, short of finishing the week.
 *
 * The same sheet changes a week already planned (Your week). There a todo
 * with no day and no day to come back is listed with Later, marked as having
 * no day yet, so it can be given one.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlignJustify, ChevronLeft, Feather, Pause, Plus } from 'lucide-react-native';
import type { Board, BoardDay, BoardHabit, BoardTodo } from '../../lib/week/board/model';
import { EASE_NOTE_MAX } from '../../lib/week/habitWeek';
import {
  DAY_NAMES,
  WEEK_COPY,
  addToDay,
  ageLabel,
  backLabel,
  dayLetter,
  habitPlanned,
  habitPlannedLighter,
  hoursRound,
  leftLabel,
  minsLabel,
  pausedOnDays,
  roomLine,
  shortDay,
} from '../../lib/week/review/words';
import { weekdayOf } from '../../lib/week/model';
import { DayRing } from './BoardCard';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

type Tab = 'days' | 'habits' | 'later';

export interface WeekBoardProps {
  visible: boolean;
  board: Board | null;
  today: string;
  /** Plan your week unless another is given */
  title?: string;
  /** Under the title: their intention, or the days being planned */
  sub: string;
  /** The day it opens on, when it is opened for one; else the first */
  openOn?: string | null;
  /** Mark the todos on a day they gave them themselves, which Gremly plans around */
  ownTag?: boolean;
  /** Gremly's spread is on this board, so what is said of a day in his voice holds */
  spread?: boolean;
  /** Gremly is spreading the week; or the last spread did not come back */
  fitting?: boolean;
  failed?: boolean;
  /** The week cannot be finished yet: the spread for it is still on its way */
  doneOff?: boolean;
  /** Done was tapped and the week is being written: nothing on the board can be tapped */
  saving?: boolean;
  onRetry?: () => void;
  onMove: (todoId: string, to: string | 'later') => void;
  onToggleHabit: (habitId: string, day: string) => void;
  /**
   * Pause a habit for the days being planned, give it a lighter version for
   * them (note: what that is, in their words), or neither (null)
   */
  onEaseHabit: (habitId: string, want: 'pause' | 'lighter' | null, note?: string) => void;
  onDone: () => void;
  /** Leave without finishing */
  onClose: () => void;
}

/** A share of a bar as a width, between none and all of it. */
const pct = (share: number) =>
  `${Math.round(Math.max(0, Math.min(100, share)) * 10) / 10}%` as `${number}%`;

const OVER = '#C2410C';
const OVER_RING = '#E8743B';

/** Todos in groups by the part of their life they belong to, the most moved first. */
function grouped(todos: BoardTodo[]): { name: string; items: BoardTodo[] }[] {
  const by = new Map<string, BoardTodo[]>();
  for (const t of todos) {
    const name = t.group ?? WEEK_COPY.everythingElse;
    by.set(name, [...(by.get(name) ?? []), t]);
  }
  return [...by.entries()]
    .sort(([a], [b]) =>
      a === WEEK_COPY.everythingElse ? 1 : b === WEEK_COPY.everythingElse ? -1 : a.localeCompare(b),
    )
    .map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => b.moved - a.moved || a.title.localeCompare(b.title)),
    }));
}

/** The chips a todo can be moved to: each day being planned, and Later. */
function MoveChips({
  days,
  at,
  onPick,
}: {
  days: BoardDay[];
  at: string | 'later';
  onPick: (to: string | 'later') => void;
}) {
  return (
    <View style={styles.moves}>
      {[
        ...days.map((d) => ({ to: d.day, label: shortDay(d.day) })),
        {
          to: 'later' as const,
          label: WEEK_COPY.later,
        },
      ].map((m) => {
        const on = m.to === at;
        return (
          <TouchableOpacity
            key={m.to}
            style={[styles.move, on && styles.moveOn]}
            onPress={() => onPick(m.to)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            testID={`week-move-${m.to}`}
          >
            <Text style={[styles.moveText, on && styles.moveTextOn]}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** What the lighter version is, in their words. It keeps what is typed, and says each change. */
function LighterNote({ habit, onWrite }: { habit: BoardHabit; onWrite: (note: string) => void }) {
  const [text, setText] = useState(habit.note);
  return (
    <>
      <TextInput
        style={styles.easeInput}
        value={text}
        onChangeText={(t) => {
          setText(t);
          onWrite(t);
        }}
        placeholder={WEEK_COPY.lighterPlaceholder}
        placeholderTextColor={WEEK.faint}
        accessibilityLabel={`${WEEK_COPY.lighterVersion}: ${habit.title}`}
        maxLength={EASE_NOTE_MAX}
        returnKeyType="done"
        testID={`week-board-habit-${habit.id}-note`}
      />
      <Text style={styles.easeNote}>{WEEK_COPY.lighterNote}</Text>
    </>
  );
}

/** The two ways to ease a habit for the days being planned: pause it, or do a lighter version. */
function HabitEase({
  habit,
  onEase,
}: {
  habit: BoardHabit;
  onEase: (want: 'pause' | 'lighter' | null, note?: string) => void;
}) {
  const paused = habit.ease === 'pause';
  const lighter = habit.ease === 'lighter';
  return (
    <View style={styles.ease}>
      <View style={styles.easeRow}>
        <TouchableOpacity
          style={[styles.easeChip, paused && styles.easeChipOn]}
          onPress={() => onEase(paused ? null : 'pause')}
          accessibilityRole="button"
          accessibilityState={{ selected: paused }}
          accessibilityLabel={`${WEEK_COPY.pauseWeek}: ${habit.title}`}
          testID={`week-board-habit-${habit.id}-pause`}
        >
          <Pause size={14} color={paused ? WEEK.linen : WEEK.green} strokeWidth={2.2} />
          <Text style={[styles.easeText, paused && styles.easeTextOn]}>{WEEK_COPY.pauseWeek}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.easeChip, lighter && styles.easeChipOn]}
          // it starts from the words saved for these days, else the habit's own smallest version
          onPress={() => (lighter ? onEase(null) : onEase('lighter', habit.smallest))}
          accessibilityRole="button"
          accessibilityState={{ selected: lighter }}
          accessibilityLabel={`${WEEK_COPY.lighterVersion}: ${habit.title}`}
          testID={`week-board-habit-${habit.id}-lighter`}
        >
          <Feather size={14} color={lighter ? WEEK.linen : WEEK.green} strokeWidth={2.2} />
          <Text style={[styles.easeText, lighter && styles.easeTextOn]}>
            {WEEK_COPY.lighterVersion}
          </Text>
        </TouchableOpacity>
      </View>
      {paused ? <Text style={styles.easeNote}>{WEEK_COPY.pausedNote}</Text> : null}
      {/* there only while it is on a lighter version, so it starts each time from the words as they stand */}
      {lighter ? <LighterNote habit={habit} onWrite={(note) => onEase('lighter', note)} /> : null}
    </View>
  );
}

function Age({ todo, today, pill }: { todo: BoardTodo; today: string; pill?: boolean }) {
  const age = ageLabel(todo, today);
  if (!age.show) return null;
  return pill ? (
    <Text style={[styles.agePill, age.old && styles.agePillOld]}>{age.text}</Text>
  ) : (
    <Text style={[styles.age, age.old && styles.ageOld]}>{age.text}</Text>
  );
}

export function WeekBoard(p: WeekBoardProps) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('days');
  const [day, setDay] = useState<string | null>(null);
  const [openTodo, setOpenTodo] = useState<string | null>(null);
  const [openLater, setOpenLater] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  // each opening starts on the days, on the first of them
  useEffect(() => {
    if (!p.visible) return;
    setTab('days');
    setDay(p.openOn ?? null);
    setOpenTodo(null);
    setOpenLater(null);
    setTray(false);
    // only on opening: the day it opens on is not followed after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.visible]);

  const board = p.board;
  const days = useMemo(() => board?.days ?? [], [board]);
  const picked = days.find((d) => d.day === day) ?? days[0] ?? null;
  // what can be given a day: everything put off, and what has no day yet
  const laterGroups = useMemo(
    () => grouped([...(board?.later ?? []), ...(board?.loose ?? [])]),
    [board?.later, board?.loose],
  );
  const waiting = (board?.later.length ?? 0) + (board?.loose.length ?? 0);
  const busyDays = useMemo(() => new Set(days.filter((d) => d.busy).map((d) => d.day)), [days]);
  const pickTab = (t: Tab) => {
    setTab(t);
    setOpenTodo(null);
    setOpenLater(null);
  };
  const move = (id: string, to: string | 'later') => {
    p.onMove(id, to);
    setOpenTodo(null);
    setOpenLater(null);
  };

  const totals = board?.totals;
  const whole = totals ? Math.max(1, totals.room + totals.later) : 1;
  const part = (minutes: number) => pct((minutes / whole) * 100);
  // how much of the picked day its habits and its todos take, as widths of its bar
  const habitShare = picked?.minutes ? (picked.habitMinutes / picked.minutes) * 100 : 0;
  const todoShare = picked?.minutes ? (picked.todoMinutes / picked.minutes) * 100 : 100;

  return (
    <Modal
      visible={p.visible}
      animationType="slide"
      // the phone's own back is the arrow: not while the week is being written
      onRequestClose={() => {
        if (!p.saving) p.onClose();
      }}
    >
      <View style={styles.sheet} pointerEvents={p.saving ? 'none' : 'auto'} testID="week-board">
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headRow}>
            <TouchableOpacity
              style={styles.close}
              onPress={p.onClose}
              disabled={p.saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={WEEK_COPY.boardClose}
              testID="week-board-close"
            >
              <ChevronLeft size={24} color={WEEK.linen} strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={styles.headFace}>
              <Image source={WEEK_MASCOTS.clipboard} style={styles.headMascot} />
            </View>
            <View style={styles.headWords}>
              <Text style={styles.headTitle}>{p.title ?? WEEK_COPY.boardTitle}</Text>
              <Text style={styles.headSub} numberOfLines={1}>
                {p.sub}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.done, (p.saving || p.doneOff) && weekStyles.off]}
              onPress={p.onDone}
              disabled={p.saving || p.doneOff}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!(p.saving || p.doneOff) }}
              testID="week-board-done"
            >
              <Text style={styles.doneText}>{WEEK_COPY.boardDone}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tabs}>
            {(
              [
                ['days', WEEK_COPY.tabDays],
                ['habits', WEEK_COPY.tabHabits],
                ['later', WEEK_COPY.tabLater],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <TouchableOpacity
                key={id}
                style={[styles.tab, tab === id && styles.tabOn]}
                onPress={() => pickTab(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === id }}
                testID={`week-board-tab-${id}`}
              >
                <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          // the lighter version's words are typed on this sheet
          automaticallyAdjustKeyboardInsets
        >
          {p.fitting ? (
            <View style={[weekStyles.card, styles.notice]} testID="week-board-fitting">
              <Image source={WEEK_MASCOTS.laptop} style={styles.noticeMascot} />
              <View style={weekStyles.grow}>
                <Text style={styles.noticeTitle}>{WEEK_COPY.fitting}</Text>
                <Text style={weekStyles.hint}>{WEEK_COPY.fittingHint}</Text>
              </View>
              <ActivityIndicator color={WEEK.green} />
            </View>
          ) : p.failed ? (
            <View style={[weekStyles.card, styles.failed]} testID="week-board-failed">
              <Text style={styles.noticeText}>{WEEK_COPY.spreadFailed}</Text>
              <TouchableOpacity
                style={weekStyles.second}
                onPress={p.onRetry}
                accessibilityRole="button"
                testID="week-board-retry"
              >
                <Text style={weekStyles.secondText}>{WEEK_COPY.tryAgain}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {p.saving ? (
            <View style={[weekStyles.card, styles.notice]}>
              <Text style={[styles.noticeTitle, weekStyles.grow]}>{WEEK_COPY.boardSaving}</Text>
              <ActivityIndicator color={WEEK.green} />
            </View>
          ) : null}

          {tab === 'days' && board && totals && picked ? (
            <>
              <View style={styles.roomCard}>
                <Text style={styles.roomLine}>{roomLine(totals.room)}</Text>
                <View style={styles.roomBar}>
                  <View style={[styles.barHabits, { width: part(totals.habits) }]} />
                  <View style={[styles.barPlaced, { width: part(totals.placed) }]} />
                  <View style={[styles.barLater, { width: part(totals.later) }]} />
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.barHabits]} />
                    <Text
                      style={styles.legendText}
                    >{`${hoursRound(totals.habits)} of habits`}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.barPlaced]} />
                    <Text style={styles.legendText}>{`${hoursRound(totals.placed)} of todos`}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, styles.barLater]} />
                    <Text style={styles.legendText}>{`${hoursRound(totals.later)} in Later`}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.tiles}>
                {days.map((d) => {
                  const on = d.day === picked.day;
                  const taken = d.minutes > 0 ? (d.habitMinutes + d.todoMinutes) / d.minutes : 1;
                  return (
                    <TouchableOpacity
                      key={d.day}
                      style={[styles.tile, on && styles.tileOn]}
                      onPress={() => {
                        setDay(d.day);
                        setOpenTodo(null);
                        setTray(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${DAY_NAMES[weekdayOf(d.day)]}, ${d.todos.length} ${d.todos.length === 1 ? 'todo' : 'todos'}`}
                      testID={`week-board-day-${d.day}`}
                    >
                      <Text style={[styles.tileDay, on && styles.tileDayOn]}>
                        {shortDay(d.day)}
                      </Text>
                      <DayRing
                        size={38}
                        fraction={d.todos.length || d.habits.length ? taken : 0}
                        ring={d.left < 0 ? OVER_RING : on ? WEEK.amber : WEEK.green}
                        track={on ? 'rgba(249,246,241,0.2)' : WEEK.soft}
                        count={d.todos.length}
                        countColor={on ? WEEK.linen : WEEK.ink}
                      />
                      {d.busy ? <View style={styles.busyDot} /> : <View style={styles.noDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.panel} testID="week-board-panel">
                <View style={styles.panelHead}>
                  <Text style={styles.panelDay}>{DAY_NAMES[weekdayOf(picked.day)]}</Text>
                  <Text style={[styles.panelLeft, picked.left < 0 && styles.panelOver]}>
                    {leftLabel(picked.left)}
                  </Text>
                </View>
                <View style={styles.dayBar}>
                  <View style={[styles.barHabits, { width: pct(habitShare) }]} />
                  <View
                    style={[
                      picked.left < 0 ? styles.barOver : styles.barPlaced,
                      { width: pct(Math.min(100 - Math.min(100, habitShare), todoShare)) },
                    ]}
                  />
                </View>
                {picked.note ? (
                  <Text style={styles.note}>{picked.note}</Text>
                ) : // his own words about a busy day hold only where he spread the week and kept the day light
                p.spread && picked.busy && picked.left >= 0 ? (
                  <Text style={styles.note}>{WEEK_COPY.busyNote}</Text>
                ) : null}
                {picked.habits.length ? (
                  <View style={styles.habitChips}>
                    {picked.habits.map((h) => (
                      <View key={h.id} style={styles.habitChip}>
                        <View style={styles.habitDot} />
                        <Text style={styles.habitChipText}>{h.title}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {!picked.todos.length && !picked.habits.length ? (
                  <Text style={weekStyles.hint}>{WEEK_COPY.nothingOnDay}</Text>
                ) : null}
                {picked.todos.map((t) => {
                  const open = openTodo === t.id;
                  return (
                    <View key={t.id} style={styles.todo}>
                      <TouchableOpacity
                        style={styles.todoRow}
                        onPress={() => setOpenTodo(open ? null : t.id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        testID={`week-board-todo-${t.id}`}
                      >
                        <View style={[styles.todoDot, t.step && styles.todoDotStep]} />
                        <View style={styles.todoWords}>
                          <Text style={styles.todoTitle}>{t.title}</Text>
                          <View style={styles.todoMeta}>
                            <Text style={styles.todoMins}>{minsLabel(t.minutes)}</Text>
                            <Age todo={t} today={p.today} pill />
                            {t.gremly ? (
                              <Text style={styles.pick}>{WEEK_COPY.gremlyPick}</Text>
                            ) : null}
                            {p.ownTag && t.theirs ? (
                              <Text style={styles.own}>{WEEK_COPY.yourDay}</Text>
                            ) : null}
                          </View>
                        </View>
                        <AlignJustify size={16} color={WEEK.faint} strokeWidth={2.4} />
                      </TouchableOpacity>
                      {open ? (
                        <View style={styles.moveWrap}>
                          <Text style={weekStyles.hint}>{WEEK_COPY.moveTo}</Text>
                          <MoveChips days={days} at={picked.day} onPick={(to) => move(t.id, to)} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <TouchableOpacity
                  style={styles.add}
                  onPress={() => setTray(!tray)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: tray }}
                  testID="week-board-add"
                >
                  <Text style={styles.addText}>
                    {tray ? WEEK_COPY.closeTray : addToDay(picked.day)}
                  </Text>
                </TouchableOpacity>
                {tray ? (
                  laterGroups.length ? (
                    <View style={styles.tray}>
                      {laterGroups.map((g) => (
                        <View key={g.name} style={styles.group}>
                          <Text style={styles.groupName}>{g.name}</Text>
                          {g.items.map((t) => (
                            <TouchableOpacity
                              key={t.id}
                              style={styles.trayRow}
                              onPress={() => move(t.id, picked.day)}
                              accessibilityRole="button"
                              accessibilityLabel={`Add ${t.title} to ${DAY_NAMES[weekdayOf(picked.day)]}`}
                              testID={`week-board-add-${t.id}`}
                            >
                              <View style={styles.plus}>
                                <Plus size={14} color={WEEK.linen} strokeWidth={3} />
                              </View>
                              <Text style={styles.trayTitle}>{t.title}</Text>
                              <Text style={[styles.age, ageLabel(t, p.today).old && styles.ageOld]}>
                                {ageLabel(t, p.today).text || WEEK_COPY.thisMonth}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={weekStyles.hint}>{WEEK_COPY.laterEmpty}</Text>
                  )
                ) : null}
              </View>
            </>
          ) : null}

          {tab === 'habits' && board ? (
            <>
              <View style={styles.intro}>
                <Image source={WEEK_MASCOTS.fitness} style={styles.introMascot} />
                <Text style={styles.introText}>
                  {board.habits.length ? WEEK_COPY.habitsIntro : WEEK_COPY.noHabits}
                </Text>
              </View>
              {board.habits.map((h) => {
                const paused = h.ease === 'pause';
                const short = !paused && h.days.length < h.target;
                return (
                  <View key={h.id} style={styles.habitCard} testID={`week-board-habit-${h.id}`}>
                    <View style={styles.habitHead}>
                      <View style={weekStyles.grow}>
                        <Text style={styles.habitTitle}>{h.title}</Text>
                        <Text style={[styles.habitSub, short && styles.habitSubShort]}>
                          {paused
                            ? WEEK_COPY.habitPaused
                            : h.ease === 'lighter'
                              ? habitPlannedLighter(h.days.length, h.target)
                              : habitPlanned(h.days.length, h.target)}
                        </Text>
                        {!paused && h.pausedDays.length ? (
                          <Text style={styles.habitSub}>{pausedOnDays(h.pausedDays)}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.habitMins}>{minsLabel(h.minutes)}</Text>
                    </View>
                    {paused ? null : (
                      <View style={styles.cells}>
                        {days.map((d) => {
                          const on = h.days.includes(d.day);
                          // a day inside a pause that holds part of the week is no day to pick
                          const off = h.pausedDays.includes(d.day);
                          return (
                            <TouchableOpacity
                              key={d.day}
                              style={[
                                styles.cell,
                                on && styles.cellOn,
                                !on && !off && busyDays.has(d.day) && styles.cellBusy,
                                off && styles.cellOff,
                              ]}
                              onPress={() => p.onToggleHabit(h.id, d.day)}
                              disabled={off}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on, disabled: off }}
                              accessibilityLabel={`${h.title} on ${shortDay(d.day)}${on ? ', planned' : off ? ', paused' : ''}`}
                              testID={`week-board-habit-${h.id}-${d.day}`}
                            >
                              <Text
                                style={[
                                  styles.cellText,
                                  on && styles.cellTextOn,
                                  off && styles.cellTextOff,
                                ]}
                              >
                                {dayLetter(d.day)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <HabitEase habit={h} onEase={(want, note) => p.onEaseHabit(h.id, want, note)} />
                  </View>
                );
              })}
            </>
          ) : null}

          {tab === 'later' && board ? (
            <>
              <View style={styles.intro}>
                <Image source={WEEK_MASCOTS.sleepy} style={styles.introMascot} />
                <Text style={styles.introText}>
                  {!waiting
                    ? WEEK_COPY.laterEmpty
                    : board.loose.length
                      ? WEEK_COPY.laterIntroLoose
                      : WEEK_COPY.laterIntro}
                </Text>
              </View>
              {laterGroups.map((g) => (
                <View key={g.name} style={styles.laterCard}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  {g.items.map((t) => {
                    const open = openLater === t.id;
                    return (
                      <View key={t.id} style={styles.laterItem}>
                        <TouchableOpacity
                          style={styles.laterRow}
                          onPress={() => setOpenLater(open ? null : t.id)}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                          testID={`week-board-later-${t.id}`}
                        >
                          <View style={styles.laterWords}>
                            <Text style={styles.laterTitle}>{t.title}</Text>
                            <Text style={[styles.age, ageLabel(t, p.today).old && styles.ageOld]}>
                              {ageLabel(t, p.today).text || WEEK_COPY.addedThisMonth}
                            </Text>
                          </View>
                          <Text style={[styles.back, !t.backOn && styles.noDay]}>
                            {t.backOn ? backLabel(t.backOn, p.today) : WEEK_COPY.noDayYet}
                          </Text>
                        </TouchableOpacity>
                        {open ? (
                          <MoveChips days={days} at="later" onPick={(to) => move(t.id, to)} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: WEEK.linen },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: WEEK.ink,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // the way back without finishing: what they moved is kept, and nothing is saved
  close: { width: 24, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  headFace: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WEEK.linen,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headMascot: { width: 44, height: 44 },
  headWords: { flex: 1, minWidth: 0 },
  headTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 18, color: WEEK.linen },
  headSub: { fontFamily: 'Inter-Regular', fontSize: 12, color: WEEK.darkLabel },
  done: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: WEEK.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: WEEK.ink },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(249,246,241,0.1)',
    borderRadius: 12,
    padding: 3,
  },
  tab: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: WEEK.linen },
  tabText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: WEEK.darkText },
  tabTextOn: { color: WEEK.ink },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeMascot: { width: 56, height: 56 },
  noticeTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
  noticeText: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: WEEK.ink },
  failed: { gap: 10 },

  roomCard: { backgroundColor: WEEK.white, borderRadius: 16, padding: 12, gap: 8 },
  roomLine: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 12, color: WEEK.muted },
  roomBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: WEEK.linen2,
  },
  barHabits: { backgroundColor: '#8DBE99' },
  barPlaced: { backgroundColor: WEEK.green },
  barOver: { backgroundColor: OVER },
  barLater: { backgroundColor: WEEK.off },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 11, color: WEEK.muted },

  tiles: { flexDirection: 'row', gap: 4 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: WEEK.white,
  },
  tileOn: { backgroundColor: WEEK.ink },
  tileDay: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 11, color: WEEK.muted },
  tileDayOn: { color: WEEK.linen },
  busyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: WEEK.amberDeep },
  noDot: { width: 6, height: 6 },

  panel: { backgroundColor: WEEK.white, borderRadius: 20, padding: 14, gap: 12 },
  panelHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  panelDay: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 18, color: WEEK.ink },
  panelLeft: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: WEEK.green },
  panelOver: { color: OVER },
  dayBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: WEEK.soft,
  },
  note: {
    alignSelf: 'flex-start',
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: WEEK.amberDark,
    backgroundColor: WEEK.amberWash,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  habitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  habitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#DCEBDF',
  },
  habitDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F8A5F' },
  habitChipText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.ink },
  todo: { gap: 8, borderTopWidth: 1, borderTopColor: '#F1ECE3', paddingTop: 10 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: WEEK.green },
  todoDotStep: { backgroundColor: WEEK.amberDeep },
  todoWords: { flex: 1, minWidth: 0, gap: 3 },
  todoTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, lineHeight: 18, color: WEEK.ink },
  todoMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  todoMins: { fontFamily: 'Inter-Regular', fontSize: 12, color: WEEK.muted },
  agePill: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: WEEK.muted,
    backgroundColor: WEEK.linen2,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  agePillOld: { color: '#7C2D12', backgroundColor: '#FDE8D7' },
  age: { flexShrink: 0, fontFamily: 'Inter-SemiBold', fontSize: 11, color: WEEK.muted },
  ageOld: { color: '#7C2D12' },
  pick: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: WEEK.green,
    backgroundColor: WEEK.wash,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  // a day they gave it themselves: Gremly planned around it
  own: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: WEEK.muted,
    backgroundColor: WEEK.linen2,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  moveWrap: { gap: 6 },
  moves: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  move: {
    flexBasis: '23%',
    flexGrow: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WEEK.line,
    backgroundColor: WEEK.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveOn: { borderColor: WEEK.green, backgroundColor: WEEK.green },
  moveText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.ink },
  moveTextOn: { color: WEEK.linen },
  add: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: WEEK.green,
    backgroundColor: WEEK.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: WEEK.green },
  tray: { gap: 10 },
  group: { gap: 6 },
  groupName: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    color: WEEK.muted,
  },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WEEK.soft,
    backgroundColor: '#FDFBF8',
  },
  plus: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: WEEK.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayTitle: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.ink },

  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: WEEK.white,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  introMascot: { width: 64, height: 64 },
  introText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: WEEK.ink,
  },
  habitCard: { backgroundColor: WEEK.white, borderRadius: 18, padding: 12, gap: 10 },
  habitHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  habitTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
  habitSub: { fontFamily: 'Inter-Regular', fontSize: 12, color: WEEK.muted },
  habitSubShort: { color: WEEK.amberDark },
  habitMins: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: WEEK.muted },
  cells: { flexDirection: 'row', gap: 5 },
  cell: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: WEEK.chipLine,
    backgroundColor: WEEK.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { borderColor: '#4F8A5F', backgroundColor: '#4F8A5F' },
  cellBusy: { borderStyle: 'dashed', borderColor: WEEK.amberDeep },
  cellText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: WEEK.ink },
  cellTextOn: { color: WEEK.white },
  cellOff: { borderColor: WEEK.off, backgroundColor: WEEK.linen2 },
  cellTextOff: { color: WEEK.faint },
  ease: { gap: 8 },
  easeRow: { flexDirection: 'row', gap: 6 },
  easeChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WEEK.line,
    backgroundColor: WEEK.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  easeChipOn: { borderColor: WEEK.green, backgroundColor: WEEK.green },
  easeText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.green },
  easeTextOn: { color: WEEK.linen },
  easeNote: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, color: WEEK.muted },
  easeInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WEEK.line,
    paddingHorizontal: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: WEEK.ink,
    backgroundColor: WEEK.white,
  },

  laterCard: { backgroundColor: WEEK.white, borderRadius: 18, padding: 12, gap: 8 },
  laterItem: { gap: 6 },
  laterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  laterWords: { flex: 1, gap: 2 },
  laterTitle: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.ink },
  back: {
    flexShrink: 0,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    color: WEEK.green,
    backgroundColor: WEEK.wash,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  noDay: { color: WEEK.muted, backgroundColor: '#F3EEE5' },
});
