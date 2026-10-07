/**
 * Your week: the week they planned, read back. The Week button on Today opens
 * it once this week's review is done, and so does the button Gremly puts
 * under a reply (offer_week).
 *
 * It shows the intention, what matters most, each day with what was planned
 * and how it went, and what is waiting in Later (lib/week/yourWeek.ts). From
 * here the week can be changed by hand on the board (lib/week/board/change.ts:
 * their moves are saved on Done as one change, with one Undo), the rest of it
 * can be planned again or next week planned early where the dates allow
 * (both happen in today's thread, which makes the offer), and the
 * conversation the review happened in can be opened again.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { WeekBoard } from '../../components/week/WeekBoard';
import { YourWeekView } from '../../components/week/YourWeekView';
import { WEEK, weekStyles } from '../../components/week/weekStyles';
import { dayThreadParams, todayThreadParams } from '../../lib/brief/pinned';
import { getDateService } from '../../lib/date/DateService';
import { getWeekReview, type WeekBoardMoves } from '../../lib/repo/weekReviewRepo';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { changeBoard, saveChange } from '../../lib/week/board/change';
import { easeHabitOnBoard, groupsOf, moveTodo, toggleHabitDay } from '../../lib/week/board/model';
import { extraUsed, reviewOn } from '../../lib/week/model';
import { WEEK_COPY, intentionQuote, spanLabel } from '../../lib/week/review/words';
import { useThisWeek } from '../../lib/week/thisWeek';
import { yourWeekOf } from '../../lib/week/yourWeek';

type Item = Record<string, any>;

export default function YourWeekScreen() {
  const navigation = useNavigation<any>();
  const weekly = useThisWeek();
  const userId = useGremlyStore((s: any) => s.userId) as string | null;
  const todos = useGremlyStore((s: any) => s.todos) as Item[];
  const habits = useGremlyStore((s: any) => s.habits) as Item[];
  const habitPlans = useGremlyStore((s: any) => s.habitPlans) as Item[];
  const habitProgress = useGremlyStore((s: any) => s.habitProgress) as Item[];
  const eases = useGremlyStore((s: any) => s.habitAdaptations) as Item[];
  const worlds = useGremlyStore((s: any) => s.worlds) as Item[];
  const links = useGremlyStore((s: any) => s.dropWorldLinks) as Item[];
  const today = getDateService().ritualDay();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Their week is read each time the screen comes on. Until a read has come
  // back there is nothing to show; when it could not be read, the screen says so.
  const [tried, setTried] = useState(false);
  const read = useCallback(async () => {
    await useThisWeek.getState().refresh();
    setTried(true);
  }, []);
  useEffect(() => {
    if (!userId) return;
    void read();
    return navigation.addListener('focus', () => void read());
  }, [navigation, read, userId]);

  const row = weekly.review?.status === 'done' ? weekly.review : null;
  // planned once and being planned again in today's chat: not a week still to plan
  const again = weekly.review?.status === 'started' && !!weekly.review.answers.planned;
  const week = useMemo(
    () =>
      row
        ? yourWeekOf({
            today,
            row,
            todos: todos ?? [],
            habits: habits ?? [],
            habitPlans: habitPlans ?? [],
            habitProgress: habitProgress ?? [],
            eases: eases ?? [],
            dayOf: (ts) => getDateService().dayOf(ts),
          })
        : null,
    [row, today, todos, habits, habitPlans, habitProgress, eases],
  );

  const toThread = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Gremly', params: todayThreadParams('week') }),
    [navigation],
  );

  // ── more planning from here ───────────────────────────────────────────────
  // By today's date: out of their weekly window with the week's one extra
  // still free, the rest of it can be planned again; the day before their
  // weekly day, next week can be planned early, unless it already is.
  const on = useMemo(() => reviewOn(today, weekly.weeklyDay), [today, weekly.weeklyDay]);
  const [nextPlanned, setNextPlanned] = useState<boolean | null>(null);
  useEffect(() => {
    if (on.kind !== 'brought_forward' || !userId) return;
    let live = true;
    getWeekReview(userId, on.week_start)
      .then((next) => {
        if (live) setNextPlanned(next?.status === 'done');
      })
      .catch((err) => console.warn('[YourWeek] could not read next week:', err));
    return () => {
      live = false;
    };
  }, [on.kind, on.week_start, userId]);
  const planMore = !row
    ? null
    : on.kind === 'extra' && on.week_start === row.week_start && !extraUsed(row)
      ? { label: WEEK_COPY.planRestAgain, onPress: toThread }
      : on.kind === 'brought_forward' && nextPlanned === false
        ? { label: WEEK_COPY.planNext, onPress: toThread }
        : null;

  // ── the conversation the review happened in ───────────────────────────────
  const finishedOn = row?.completed_at ? getDateService().dayOf(row.completed_at) : null;
  const toConversation = finishedOn
    ? () =>
        navigation.navigate('Tabs', {
          screen: 'Gremly',
          params: finishedOn === today ? todayThreadParams() : dayThreadParams(finishedOn),
        })
    : null;

  // ── changing the week by hand ─────────────────────────────────────────────
  const [moves, setMoves] = useState<WeekBoardMoves>({});
  const [boardOpen, setBoardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undo: boolean } | null>(null);
  // an Undo is a function, so it lasts as long as the screen does
  const undoRef = useRef<(() => Promise<void>) | null>(null);
  const groups = useMemo(() => groupsOf(worlds ?? [], links ?? []), [worlds, links]);
  const board = useMemo(
    () =>
      row && boardOpen
        ? changeBoard({
            today,
            row,
            daysOff: weekly.daysOff,
            moves,
            todos: todos ?? [],
            habits: habits ?? [],
            habitPlans: habitPlans ?? [],
            eases: eases ?? [],
            groups,
          })
        : null,
    [row, boardOpen, today, weekly.daysOff, moves, todos, habits, habitPlans, eases, groups],
  );

  const done = async () => {
    if (!row || !board || busy) return;
    setBusy(true);
    try {
      const changed = await saveChange(row, board, moves);
      setBoardOpen(false);
      setMoves({});
      if (changed) {
        undoRef.current = changed.undo;
        setNotice({ text: WEEK_COPY.changeSaved, undo: true });
      }
    } catch (err) {
      // nothing is changed: the board closes with their moves kept on it for another try
      console.warn('[YourWeek] the change could not be saved:', err);
      setBoardOpen(false);
      setNotice({ text: WEEK_COPY.changeFailed, undo: false });
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const back = undoRef.current;
    if (!back || busy) return;
    setBusy(true);
    try {
      await back();
      undoRef.current = null;
      setNotice({ text: WEEK_COPY.changeUndone, undo: false });
    } catch (err) {
      // what could not be put back can be tried again
      console.warn('[YourWeek] the change could not all be taken back:', err);
      setNotice({ text: WEEK_COPY.changeUndoFailed, undo: true });
    } finally {
      setBusy(false);
    }
  };

  const intention = (row?.answers.intention ?? '').trim();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.back}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="your-week-back"
        >
          <ChevronLeft size={24} color={WEEK.ink} />
        </Pressable>
        <View style={styles.titles}>
          <Text style={styles.title}>{WEEK_COPY.seeWeek}</Text>
          {week ? <Text style={styles.sub}>{spanLabel(week.first, week.last)}</Text> : null}
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {week ? (
          <YourWeekView
            week={week}
            today={today}
            notice={
              notice ? { text: notice.text, onUndo: notice.undo ? () => void undo() : null } : null
            }
            planMore={planMore}
            busy={busy}
            onChange={() => {
              // What was just saved keeps its Undo while the board is looked at
              // again; a notice with nothing to undo has been read.
              setNotice((n) => (n?.undo ? n : null));
              setBoardOpen(true);
            }}
            onConversation={toConversation}
          />
        ) : !weekly.loaded ? (
          tried ? (
            <View style={styles.empty} testID="your-week-unread">
              <Text style={styles.emptyText}>{WEEK_COPY.weekUnread}</Text>
              <TouchableOpacity
                style={[weekStyles.second, styles.emptyButton]}
                onPress={() => void read()}
                accessibilityRole="button"
                testID="your-week-retry"
              >
                <Text style={weekStyles.secondText}>{WEEK_COPY.tryAgain}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityIndicator
              style={styles.loading}
              color={WEEK.green}
              testID="your-week-loading"
            />
          )
        ) : (
          <View style={styles.empty} testID="your-week-unplanned">
            <Text style={styles.emptyText}>
              {again ? WEEK_COPY.weekPlanningAgain : WEEK_COPY.weekNotPlanned}
            </Text>
            <TouchableOpacity
              style={[weekStyles.main, styles.emptyButton]}
              onPress={toThread}
              accessibilityRole="button"
              testID="your-week-plan"
            >
              <Text style={weekStyles.mainText}>
                {again ? WEEK_COPY.carryOnPlanning : WEEK_COPY.planWeek}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <WeekBoard
        visible={boardOpen && !!board}
        board={board}
        today={today}
        title={WEEK_COPY.changeWeek}
        sub={
          intention ? intentionQuote(intention) : board ? spanLabel(board.first, board.last) : ''
        }
        saving={busy}
        onMove={(id, to) => {
          if (board) setMoves((m) => moveTodo(board, m, id, to));
        }}
        onToggleHabit={(id, day) => {
          if (board) setMoves((m) => toggleHabitDay(board, m, id, day));
        }}
        onEaseHabit={(id, want, note) => {
          if (board) setMoves((m) => easeHabitOnBoard(board, m, id, want, note));
        }}
        onDone={() => void done()}
        // left without finishing: nothing is saved, and the moves are let go
        onClose={() => {
          setBoardOpen(false);
          setMoves({});
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: WEEK.linen },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, alignItems: 'center' },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 18, color: WEEK.ink },
  sub: { fontFamily: 'Inter-Regular', fontSize: 12, color: WEEK.muted },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  loading: { marginTop: 48 },
  empty: { marginTop: 48, alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    lineHeight: 23,
    color: WEEK.ink,
    textAlign: 'center',
  },
  emptyButton: { alignSelf: 'stretch' },
});
