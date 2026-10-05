/**
 * Due today: the one new view in the brief, opened from the day card's Todos
 * and Habits rows. Todos and habits in two tabs. Habits show where they are
 * for the week, with the Behind tag from the behind this week rule. A row
 * shows the time the plan gave it, or that it is in the plan. Adding to a
 * plan is the pick sheet's (PickSheet.tsx).
 */

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Habit, Todo } from '../../lib/types';
import type { DayCardData, HabitWeek } from '../../lib/brief/useDayCard';
import { ampm, clock } from '../../lib/brief/dayCard';
import { BRIEF } from './briefStyles';
import { dueWords } from '../../lib/plan/dayItems';
import { getDateService } from '../../lib/date/DateService';

export type DueTab = 'todos' | 'habits';

type Props = {
  visible: boolean;
  onClose: () => void;
  data: DayCardData;
  initialTab?: DueTab;
  /** Ids already in the live plan: "In the plan" */
  inPlan?: Set<string>;
  /** On a return day the Behind tag stays calm */
  calm?: boolean;
};

function minutesLabel(m: number | null | undefined): string | null {
  if (!m || m <= 0) return null;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
}

function WeekDots({ done, target }: { done: number; target: number }) {
  const dots = Math.min(target, 7);
  return (
    <View style={styles.dots} accessibilityLabel={`${done} of ${target} this week`}>
      {Array.from({ length: dots }).map((_, i) => (
        <View key={i} style={[styles.dot, i < done && styles.dotFilled]} />
      ))}
    </View>
  );
}

export function DueTodaySheet({
  visible,
  onClose,
  data,
  initialTab = 'todos',
  inPlan,
  calm,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<DueTab>(initialTab);
  React.useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const plannedAt = (id: string) => data.planned.find((p) => p.id === id);
  const weekOf = new Map<string, HabitWeek>(data.habitWeeks.map((w) => [w.habit.id, w]));

  const action = (id: string) => {
    const at = plannedAt(id);
    if (at) return <Text style={styles.info}>{`${clock(at.start)} ${ampm(at.start)}`}</Text>;
    if (inPlan?.has(id)) return <Text style={styles.info}>In the plan</Text>;
    return null;
  };

  // the sheet shows the day it was opened for: today, or the day being planned
  const dueLabel = dueWords(data.date, getDateService().today());

  const todoRow = (t: Todo) => {
    const meta = [minutesLabel(t.time_estimate_minutes), dueLabel].filter(Boolean).join('  ');
    return (
      <View key={t.id} style={styles.item} testID={`due-todo-${t.id}`}>
        <View style={styles.itemText}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {t.name || t.title || 'Untitled'}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
        {action(t.id)}
      </View>
    );
  };

  const habitRow = (h: Habit) => {
    const w = weekOf.get(h.id);
    const dur = minutesLabel(h.time_estimate_minutes);
    return (
      <View key={h.id} style={styles.item} testID={`due-habit-${h.id}`}>
        <View style={styles.itemText}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {h.name || 'Untitled habit'}
          </Text>
          <View style={styles.metaRow}>
            {dur ? <Text style={styles.meta}>{dur}</Text> : null}
            {w && w.target ? (
              <>
                <WeekDots done={w.done} target={w.target} />
                <Text style={styles.meta}>{`${w.done} of ${w.target} this week`}</Text>
              </>
            ) : (
              <Text style={styles.meta}>Daily</Text>
            )}
            {w?.behind ? (
              <Text
                style={[styles.behind, calm && styles.behindCalm]}
                testID={`due-behind-${h.id}`}
              >
                Behind
              </Text>
            ) : null}
          </View>
        </View>
        {action(h.id)}
      </View>
    );
  };

  // Habits behind this week come first, then the rest due today
  const behindIds = new Set(data.behind.map((h) => h.id));
  const habitsShown = [
    ...data.behind.filter((h) => !data.habitsToday.some((x) => x.id === h.id)),
    ...data.habitsToday,
  ].sort((a, b) => Number(behindIds.has(b.id)) - Number(behindIds.has(a.id)));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} testID="due-today-sheet">
        <View style={styles.grab} />
        <View style={styles.head}>
          <Text style={styles.title}>{dueLabel}</Text>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={18} color={BRIEF.moss} />
          </TouchableOpacity>
        </View>
        <View style={styles.tabs}>
          {(['todos', 'habits'] as DueTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabOn]}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              testID={`due-tab-${t}`}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                {t === 'todos'
                  ? `Todos (${data.todosDue.length})`
                  : `Habits (${habitsShown.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {tab === 'todos' ? (
            data.todosDue.length ? (
              data.todosDue.map(todoRow)
            ) : (
              <Text
                style={styles.empty}
              >{`Nothing ${dueLabel.charAt(0).toLowerCase()}${dueLabel.slice(1)}`}</Text>
            )
          ) : habitsShown.length ? (
            habitsShown.map(habitRow)
          ) : (
            <Text style={styles.empty}>No habits for today</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20, 30, 24, 0.32)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: BRIEF.linen,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(26,51,40,0.18)',
    marginTop: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: BRIEF.mossInk,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E8E3D9',
    borderRadius: 14,
    padding: 3,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  tabOn: {
    backgroundColor: BRIEF.white,
  },
  tabText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 14,
    color: BRIEF.muted,
  },
  tabTextOn: {
    color: BRIEF.mossInk,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: 8,
    paddingBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BRIEF.white,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BRIEF.line,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14.5,
    color: BRIEF.mossInk,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 12.5,
    color: BRIEF.muted,
    marginTop: 3,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(46,85,64,0.18)',
  },
  dotFilled: {
    backgroundColor: BRIEF.moss,
  },
  behind: {
    marginTop: 3,
    backgroundColor: BRIEF.pearWash,
    color: BRIEF.pearInk,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 11.5,
    overflow: 'hidden',
  },
  behindCalm: {
    backgroundColor: BRIEF.sageWash,
    color: BRIEF.moss,
  },
  info: {
    fontFamily: 'Inter-Medium',
    fontSize: 12.5,
    color: BRIEF.muted,
  },
  empty: {
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    color: BRIEF.faint,
    fontStyle: 'italic',
    paddingVertical: 12,
    textAlign: 'center',
  },
});
