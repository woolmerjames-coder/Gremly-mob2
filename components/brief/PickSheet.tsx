/**
 * The pick sheet (Daily brief in Chat): the day's todos and habits to pick
 * from, with how much of the free time the picks take. It stays open while
 * they pick, and one button adds them all. Planning the day opens it with
 * Gremly's suggestions on top; picking nothing there asks Gremly to help
 * first. Add something on a plan opens it too. It opens on the tab last used.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Square, SquareCheck, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRIEF } from './briefStyles';
import {
  lastPickTab,
  rememberPickTab,
  timeLeftWords,
  type PickItem,
  type PickTab,
} from '../../lib/plan/pickItems';

/** A suggestion from Gremly: the row and why */
export type Suggestion = PickItem & { reason?: string | null };

export type PickSheetProps = {
  visible: boolean;
  title: string;
  /** Free minutes the picks fill */
  free: number;
  todos: PickItem[];
  habits: PickItem[];
  /** Gremly's suggestions, shown on top: null while Gremly is choosing */
  suggested?: Suggestion[] | null;
  /** Already in the plan: shown, not pickable */
  inPlan?: Set<string>;
  /** The button with picks: "Add 3, 1h 30m" */
  confirmWords: (n: number, minutes: number) => string;
  onConfirm: (picks: PickItem[]) => void;
  /** With nothing picked: the button asks Gremly to help first */
  askWords?: string;
  onAsk?: () => void;
  onClose: () => void;
};

export function PickSheet({
  visible,
  title,
  free,
  todos,
  habits,
  suggested,
  inPlan,
  confirmWords,
  onConfirm,
  askWords,
  onAsk,
  onClose,
}: PickSheetProps) {
  const insets = useSafeAreaInsets();
  const [tab, setTabState] = useState<PickTab>(lastPickTab());
  const [picked, setPicked] = useState<Map<string, PickItem>>(new Map());
  useEffect(() => {
    if (!visible) return;
    setTabState(lastPickTab());
    setPicked(new Map());
  }, [visible]);
  const setTab = (t: PickTab) => {
    rememberPickTab(t);
    setTabState(t);
  };

  const shownIds = useMemo(() => new Set((suggested ?? []).map((s) => s.id)), [suggested]);
  const rest = (tab === 'todos' ? todos : habits).filter((x) => !shownIds.has(x.id));
  const minutes = [...picked.values()].reduce((a, x) => a + x.minutes, 0);
  const words = timeLeftWords(free, minutes);
  const fill = free > 0 ? Math.min(1, minutes / free) : minutes ? 1 : 0;

  const toggle = (x: PickItem) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(x.id)) next.delete(x.id);
      else next.set(x.id, x);
      return next;
    });
  const pickAll = () =>
    setPicked((m) => {
      const next = new Map(m);
      for (const s of suggested ?? []) if (!inPlan?.has(s.id)) next.set(s.id, s);
      return next;
    });

  const row = (x: PickItem | Suggestion) => {
    const already = inPlan?.has(x.id);
    const on = picked.has(x.id);
    const reason = (x as Suggestion).reason;
    return (
      <Pressable
        key={x.id}
        style={[styles.item, on && styles.itemOn]}
        onPress={() => toggle(x)}
        disabled={already}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled: already }}
        accessibilityLabel={x.title}
        testID={`pick-${x.id}`}
      >
        <View style={styles.itemText}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {x.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {reason ? `${x.meta.split(',')[0]}, ${reason}` : x.meta}
            </Text>
            {x.behind ? <Text style={styles.behind}>Behind</Text> : null}
          </View>
        </View>
        {already ? (
          <Text style={styles.info}>In the plan</Text>
        ) : on ? (
          <SquareCheck size={22} color={BRIEF.moss} strokeWidth={2} />
        ) : (
          <Square size={22} color={BRIEF.faint} strokeWidth={2} />
        )}
      </Pressable>
    );
  };

  const canConfirm = picked.size > 0;
  const canAsk = !canConfirm && !!onAsk;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} testID="pick-sheet">
        <View style={styles.grab} />
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={18} color={BRIEF.moss} />
          </TouchableOpacity>
        </View>

        <View style={styles.timeRow} testID="pick-time">
          <Text style={styles.timePicked}>{words.picked}</Text>
          <Text style={[styles.timeLeft, words.over && styles.timeOver]}>{words.left}</Text>
        </View>
        <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no">
          <View
            style={[styles.barFill, words.over && styles.barOver, { width: `${fill * 100}%` }]}
          />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {suggested !== undefined ? (
            <View style={styles.section} testID="pick-suggested">
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Gremly suggests</Text>
                {suggested?.length ? (
                  <TouchableOpacity onPress={pickAll} testID="pick-all" hitSlop={8}>
                    <Text style={styles.link}>Pick all</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {suggested === null ? (
                <View style={styles.loading}>
                  <ActivityIndicator size="small" color={BRIEF.moss} />
                  <Text style={styles.meta}>Gremly is looking at your day</Text>
                </View>
              ) : (
                suggested.map(row)
              )}
            </View>
          ) : null}

          <View style={styles.tabs}>
            {(['todos', 'habits'] as PickTab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && styles.tabOn]}
                onPress={() => setTab(t)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                testID={`pick-tab-${t}`}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                  {t === 'todos' ? `Todos (${todos.length})` : `Habits (${habits.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {rest.length ? (
            rest.map(row)
          ) : (
            <Text style={styles.empty}>
              {tab === 'todos' ? 'No other todos for this day' : 'No other habits for this day'}
            </Text>
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.btn, !canConfirm && !canAsk && styles.btnOff, canAsk && styles.btnAsk]}
          onPress={() => (canConfirm ? onConfirm([...picked.values()]) : onAsk?.())}
          disabled={!canConfirm && !canAsk}
          accessibilityRole="button"
          testID="pick-confirm"
        >
          <Text style={[styles.btnText, canAsk && styles.btnTextAsk]}>
            {canConfirm
              ? confirmWords(picked.size, minutes)
              : canAsk
                ? (askWords ?? 'Help me choose')
                : 'Pick something to add'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20, 30, 24, 0.32)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
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
    paddingBottom: 8,
  },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 20, color: BRIEF.mossInk },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  timePicked: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13.5, color: BRIEF.mossInk },
  timeLeft: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13.5, color: BRIEF.moss },
  timeOver: { color: BRIEF.warn },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: BRIEF.white,
    borderWidth: 1,
    borderColor: BRIEF.line,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: { height: '100%', backgroundColor: BRIEF.moss },
  barOver: { backgroundColor: BRIEF.warn },
  body: { flexGrow: 0 },
  bodyContent: { gap: 8, paddingBottom: 12 },
  section: { gap: 8, marginBottom: 6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, color: BRIEF.mossInk },
  link: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13.5, color: BRIEF.moss },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E8E3D9',
    borderRadius: 14,
    padding: 3,
    marginTop: 4,
    marginBottom: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11 },
  tabOn: { backgroundColor: BRIEF.white },
  tabText: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14, color: BRIEF.muted },
  tabTextOn: { color: BRIEF.mossInk },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: BRIEF.white,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: BRIEF.line,
    minHeight: 56,
  },
  itemOn: { borderColor: BRIEF.moss },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14.5, color: BRIEF.mossInk },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  meta: { fontFamily: 'Inter-Regular', fontSize: 12.5, color: BRIEF.muted },
  behind: {
    backgroundColor: BRIEF.pearWash,
    color: BRIEF.pearInk,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 11.5,
    overflow: 'hidden',
  },
  info: { fontFamily: 'Inter-Medium', fontSize: 12.5, color: BRIEF.muted },
  empty: {
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    color: BRIEF.faint,
    fontStyle: 'italic',
    paddingVertical: 12,
    textAlign: 'center',
  },
  btn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: BRIEF.moss,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnOff: { opacity: 0.4 },
  btnAsk: { backgroundColor: BRIEF.white, borderWidth: 1.5, borderColor: BRIEF.chipBorder },
  btnText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: BRIEF.white },
  btnTextAsk: { color: BRIEF.mossInk },
});
