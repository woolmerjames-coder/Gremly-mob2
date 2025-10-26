import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Line } from 'react-native-svg';
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { COLORS, RADII, SPACE } from '../_tokens';
import { useAuth } from '../../../../providers/AuthProvider';
import { SupabaseSpaceMilestoneRepo } from '../../../../lib/repo/supabase';
import Menu from '../../v33/Menu';

export type TimelineDay = {
  dateISO: string;
  items?: Array<{
    id: string;
    type: 'habit' | 'todo' | 'note';
    title?: string | null;
    name?: string | null;
    subtype?: string | null;
    done?: boolean;
  }>;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  days: TimelineDay[];
  selectedISO: string;
  onSelectDate: (iso: string) => void;
  onAddMilestone?: () => void; // optional: legacy callback (will be ignored if repo available)
  // Kebab actions delegated to parent (SpaceHome) for items
  onEditItem?: (id: string) => void;
  onToggleTodoPause?: (id: string) => void | Promise<void>;
  onDeleteItem?: (id: string) => void | Promise<void>;
  onViewChatContext?: () => void;
};

export default function CalendarOverlay({
  visible,
  onClose,
  spaceId,
  spaceName,
  days,
  selectedISO,
  onSelectDate,
  onAddMilestone,
  onEditItem,
  onToggleTodoPause,
  onDeleteItem,
  onViewChatContext,
}: Props) {
  const y = useMemo(() => new Animated.Value(500), []);
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 500,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, y, opacity]);

  const selectedDate = useMemo(() => new Date(selectedISO), [selectedISO]);
  const monthStart = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const monthEnd = useMemo(() => endOfMonth(selectedDate), [selectedDate]);
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd), [monthEnd]);
  const weeks: string[][] = useMemo(() => {
    const rows: string[][] = [];
    let cur = gridStart;
    while (cur <= gridEnd) {
      const row: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        row.push(format(cur, 'yyyy-MM-dd'));
        cur = addDays(cur, 1);
      }
      rows.push(row);
    }
    return rows;
  }, [gridStart, gridEnd]);

  const dayMap = useMemo(() => {
    const m = new Map<string, TimelineDay>();
    for (const d of days) m.set(d.dateISO, d);
    return m;
  }, [days]);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate), [selectedDate]);
  const weekRangeLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`;

  const weekCounts = useMemo(() => {
    let runs = 0;
    let reflections = 0;
    let milestones = 0;
    for (let i = 0; i < 7; i += 1) {
      const iso = format(addDays(weekStart, i), 'yyyy-MM-dd');
      const d = dayMap.get(iso);
      const items = d?.items || [];
      runs += items.filter((it) => it.type === 'habit' && !!it.done).length;
      const refls = items.filter(
        (it) => it.type === 'note' && (it.subtype === 'journal' || it.subtype === 'reflection'),
      ).length;
      reflections += refls;
      milestones += 0; // incremented later after loading milestones
    }
    return { runs, reflections, milestones };
  }, [dayMap, weekStart]);

  const selectedEntries = useMemo(() => {
    const d = dayMap.get(format(selectedDate, 'yyyy-MM-dd'));
    return d?.items || [];
  }, [dayMap, selectedDate]);

  // Milestones state and repo wiring
  const { userId } = useAuth();
  const [milestones, setMilestones] = useState<
    Array<{
      id: string;
      title: string;
      date: string;
      note?: string | null;
    }>
  >([]);
  const [loadingMs, setLoadingMs] = useState(false);
  const [errorMs, setErrorMs] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [adding, setAdding] = useState(false);

  const loadMilestones = useCallback(async () => {
    if (!userId) return;
    setLoadingMs(true);
    setErrorMs(null);
    try {
      const repo = new SupabaseSpaceMilestoneRepo(userId);
      const rows = await repo.list(spaceId);
      setMilestones(rows);
    } catch (e: any) {
      setErrorMs(e?.message || 'Failed to load milestones');
    } finally {
      setLoadingMs(false);
    }
  }, [spaceId, userId]);

  useEffect(() => {
    if (!visible) return;
    void loadMilestones();
  }, [visible, loadMilestones]);

  const milestonesByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const ms of milestones) {
      m.set(ms.date, (m.get(ms.date) || 0) + 1);
    }
    return m;
  }, [milestones]);

  const weekMilestoneCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i += 1) {
      const iso = format(addDays(weekStart, i), 'yyyy-MM-dd');
      n += milestonesByDate.get(iso) || 0;
    }
    return n;
  }, [milestonesByDate, weekStart]);

  const dayMilestones = useMemo(() => {
    const iso = format(selectedDate, 'yyyy-MM-dd');
    return milestones.filter((m) => m.date === iso);
  }, [milestones, selectedDate]);

  // Local menu state for item rows and milestones
  const [menuTodoId, setMenuTodoId] = useState<string | null>(null);
  const [menuMilestoneId, setMenuMilestoneId] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: y }] }]}>
        {/* Deep Forest glass (8% blur) */}
        <BlurView intensity={8} style={StyleSheet.absoluteFill} tint="dark" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(26,51,40,0.6)' }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your {spaceName} Timeline</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
            <View style={styles.closeBtn}>
              <Svg width={16} height={16} viewBox="0 0 16 16">
                <Line
                  x1="2"
                  y1="2"
                  x2="14"
                  y2="14"
                  stroke={COLORS.Sage}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <Line
                  x1="14"
                  y1="2"
                  x2="2"
                  y2="14"
                  stroke={COLORS.Sage}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </TouchableOpacity>
        </View>

        {/* Month grid */}
        <View style={styles.monthWrap}>
          <Text style={styles.monthLabel}>{format(selectedDate, 'MMMM yyyy')}</Text>
          <View style={styles.dowRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <Text key={d} style={styles.dowText}>
                {d}
              </Text>
            ))}
          </View>
          {weeks.map((row, i) => (
            <View key={i} style={styles.weekRow}>
              {row.map((iso) => {
                const dt = new Date(iso);
                const inMonth = dt.getMonth() === monthStart.getMonth();
                const isSelected = iso === format(selectedDate, 'yyyy-MM-dd');
                const hasItems = (dayMap.get(iso)?.items?.length || 0) > 0;
                const hasMs = (milestonesByDate.get(iso) || 0) > 0;
                return (
                  <TouchableOpacity
                    key={iso}
                    onPress={() => {
                      onSelectDate(iso);
                    }}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        !inMonth && styles.dayCellMuted,
                      ]}
                    >
                      <Text style={[styles.dayNum, !inMonth && styles.dayNumMuted]}>
                        {dt.getDate()}
                      </Text>
                      {(hasItems || hasMs) && <View style={styles.dayDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Weekly summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            Week of {weekRangeLabel} • {weekCounts.runs} runs • {weekCounts.reflections} reflections
            • {weekMilestoneCount} milestones
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (onAddMilestone) return onAddMilestone();
              setAdding(true);
              setEditingId(null);
              setDraftTitle('');
              setDraftNote('');
            }}
            accessibilityRole="button"
          >
            <View style={styles.addMilestoneBtn}>
              <Text style={styles.addMilestoneText}>+ Add milestone</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Day entries */}
        <View style={styles.entriesWrap}>
          <Text style={styles.entriesTitle}>Entries for {format(selectedDate, 'EEE, MMM d')}</Text>
          {selectedEntries.length === 0 ? (
            <Text style={styles.emptyEntries}>No entries for this day.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {selectedEntries.map((it: any) => {
                const isTodo = it.type === 'todo';
                return (
                  <View key={it.id} style={styles.entryRow}>
                    <View style={{ paddingRight: 36 }}>
                      <Text style={styles.entryTitle}>{it.title || it.name || 'Untitled'}</Text>
                      <Text style={styles.entryMeta}>
                        {isTodo ? 'To-do' : it.type === 'habit' ? 'Habit' : 'Note'}
                      </Text>
                    </View>
                    {isTodo && (
                      <View style={{ position: 'absolute', right: 0, top: 10 }}>
                        <TouchableOpacity
                          onPress={() => setMenuTodoId(it.id)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.kebab}>⋯</Text>
                        </TouchableOpacity>
                        {menuTodoId === it.id && (
                          <View style={styles.menuWrap}>
                            <Menu
                              items={[
                                { key: 'edit', label: 'Edit' },
                                { key: 'toggle', label: 'Pause/Resume' },
                                { key: 'delete', label: 'Delete', danger: true },
                                { key: 'chat', label: 'View Chat Context' },
                              ]}
                              onSelect={async (key: string) => {
                                if (key === 'edit' && onEditItem) onEditItem(it.id);
                                else if (key === 'toggle' && onToggleTodoPause)
                                  await onToggleTodoPause(it.id);
                                else if (key === 'delete' && onDeleteItem)
                                  await onDeleteItem(it.id);
                                else if (key === 'chat' && onViewChatContext) onViewChatContext();
                                setMenuTodoId(null);
                              }}
                            />
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Milestones */}
        <View style={styles.milestonesWrap}>
          <Text style={styles.milestonesTitle}>Milestones</Text>
          {!!errorMs && <Text style={styles.milestonesTodo}>{errorMs}</Text>}
          {/* Add/edit form */}
          {(adding || editingId) && (
            <View style={styles.formWrap}>
              <Text style={styles.formLabel}>Title</Text>
              <TextInput
                placeholder="What happened?"
                placeholderTextColor="rgba(249,246,241,0.6)"
                style={styles.input}
                value={draftTitle}
                onChangeText={setDraftTitle}
              />
              <Text style={styles.formLabel}>Note (optional)</Text>
              <TextInput
                placeholder="Add a short note"
                placeholderTextColor="rgba(249,246,241,0.6)"
                style={[styles.input, { height: 64 }]}
                value={draftNote}
                onChangeText={setDraftNote}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={async () => {
                    if (!userId) return;
                    const repo = new SupabaseSpaceMilestoneRepo(userId);
                    const dateIso = format(selectedDate, 'yyyy-MM-dd');
                    try {
                      if (editingId) {
                        await repo.update(editingId, {
                          title: draftTitle.trim() || 'Milestone',
                          note: draftNote.trim() || null,
                        });
                      } else {
                        await repo.create({
                          space_id: spaceId,
                          title: draftTitle.trim() || 'Milestone',
                          date: dateIso,
                          note: draftNote.trim() || null,
                        });
                      }
                      setAdding(false);
                      setEditingId(null);
                      setDraftTitle('');
                      setDraftNote('');
                      await loadMilestones();
                    } catch (e) {
                      setErrorMs((e as any)?.message || 'Failed to save milestone');
                    }
                  }}
                >
                  <View style={styles.saveBtn}>
                    <Text style={styles.saveBtnText}>Save</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAdding(false);
                    setEditingId(null);
                    setDraftTitle('');
                    setDraftNote('');
                  }}
                >
                  <View style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* List by selected day */}
          {dayMilestones.length === 0 ? (
            <Text style={styles.milestonesTodo}>No milestones for this day.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {dayMilestones.map((m) => (
                <View key={m.id} style={styles.milestoneRow}>
                  <Text style={styles.milestoneItem}>• {m.title}</Text>
                  <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                      onPress={() => setMenuMilestoneId(m.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.kebabLight}>⋯</Text>
                    </TouchableOpacity>
                    {menuMilestoneId === m.id && (
                      <View style={[styles.menuWrap, { right: 0 }]}>
                        <Menu
                          items={[
                            { key: 'edit', label: 'Edit' },
                            { key: 'delete', label: 'Delete', danger: true },
                          ]}
                          onSelect={async (key: string) => {
                            if (key === 'edit') {
                              setEditingId(m.id);
                              setAdding(false);
                              setDraftTitle(m.title);
                              setDraftNote(m.note || '');
                            } else if (key === 'delete') {
                              if (!userId) return;
                              const repo = new SupabaseSpaceMilestoneRepo(userId);
                              try {
                                await repo.delete(m.id);
                                await loadMilestones();
                              } catch (e) {
                                setErrorMs((e as any)?.message || 'Failed to delete milestone');
                              }
                            }
                            setMenuMilestoneId(null);
                          }}
                        />
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.lg,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.4)',
  },
  headerTitle: { color: COLORS.Linen, fontSize: 16, fontWeight: '700' },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.Sage,
  },
  monthWrap: { paddingTop: SPACE.sm },
  monthLabel: { color: COLORS.Linen, fontWeight: '700' },
  dowRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dowText: {
    color: 'rgba(249,246,241,0.6)',
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.card,
    backgroundColor: 'rgba(249,246,241,0.06)',
  },
  dayCellSelected: { backgroundColor: 'rgba(191,216,192,0.25)' },
  dayCellMuted: { opacity: 0.5 },
  dayNum: { color: COLORS.Linen, fontWeight: '700' },
  dayNumMuted: { color: 'rgba(249,246,241,0.6)' },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.Pear, marginTop: 4 },
  summaryRow: {
    marginTop: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryText: { color: COLORS.Linen },
  addMilestoneBtn: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.btn,
  },
  addMilestoneText: { color: COLORS.Linen, fontWeight: '700' },
  entriesWrap: { marginTop: SPACE.md },
  entriesTitle: { color: COLORS.Linen, fontWeight: '700', marginBottom: 6 },
  emptyEntries: { color: 'rgba(249,246,241,0.7)' },
  entryRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.25)',
  },
  entryTitle: { color: COLORS.Linen, fontWeight: '600' },
  entryMeta: { color: 'rgba(249,246,241,0.7)', marginTop: 2, fontSize: 12 },
  milestonesWrap: { marginTop: SPACE.lg },
  milestonesTitle: { color: COLORS.Linen, fontWeight: '700', marginBottom: 6 },
  milestonesTodo: { color: 'rgba(249,246,241,0.7)', marginBottom: 6 },
  milestoneItem: { color: COLORS.Linen },
  kebab: { color: COLORS.Linen, fontSize: 18, paddingHorizontal: 8, paddingVertical: 4 },
  kebabLight: { color: COLORS.Linen, fontSize: 16, paddingHorizontal: 6, paddingVertical: 2 },
  menuWrap: {
    position: 'absolute',
    top: 24,
    right: 0,
    zIndex: 10,
  },
  // New styles for milestones CRUD
  formWrap: {
    marginTop: SPACE.sm,
    backgroundColor: 'rgba(249,246,241,0.06)',
    borderRadius: RADII.card,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.25)',
  },
  formLabel: { color: COLORS.Linen, fontWeight: '600', marginTop: 6, marginBottom: 4 },
  input: {
    color: COLORS.Linen,
    backgroundColor: 'rgba(249,246,241,0.06)',
    borderRadius: RADII.btn,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.25)',
  },
  saveBtn: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.btn,
  },
  saveBtnText: { color: COLORS.Linen, fontWeight: '700' },
  cancelBtn: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.btn,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.4)',
  },
  cancelBtnText: { color: COLORS.Sage, fontWeight: '700' },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(191,216,192,0.25)',
  },
  inlineAction: { color: COLORS.Sage, fontWeight: '700' },
  inlineActionDanger: { color: '#ffb4a2', fontWeight: '700' },
});
