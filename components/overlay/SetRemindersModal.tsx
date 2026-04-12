import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { X, Bell, Plus, Trash2, Clock, AlarmClock, Repeat } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { colors, spacing, borderRadius } from '../../design/tokens';
import type { ItemReminder } from '../../lib/types';
import { getDateService } from '../../lib/date/DateService';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReminderFrequency = ItemReminder['frequency'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeFromHHMM(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatReminderDescription(reminder: ItemReminder): string {
  const timeStr = formatTimeFromHHMM(reminder.time);
  if (reminder.frequency === 'weekdays') {
    return `Weekdays at ${timeStr}`;
  }
  if (reminder.frequency === 'weekends') {
    return `Weekends at ${timeStr}`;
  }
  if (reminder.frequency === 'weekly' && reminder.days_of_week?.length) {
    const dayNames = reminder.days_of_week.map((d) => DAY_LABELS[d]).join(', ');
    return `${dayNames} at ${timeStr}`;
  }
  if (reminder.frequency === 'daily') {
    return `Daily at ${timeStr}`;
  }
  if (reminder.date) {
    return `${getDateService().formatForChip(reminder.date)} at ${timeStr}`;
  }
  return `At ${timeStr}`;
}

function roundToNearest(minutes: number, interval: number): number {
  return Math.round(minutes / interval) * interval;
}

function getTodayDateString(): string {
  return getDateService().today();
}

function getTomorrowDateString(): string {
  return getDateService().tomorrow();
}

function makeId(): string {
  return `reminder-${getDateService().now().getTime()}`;
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayMidnight(): Date {
  const d = getDateService().now();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateFromReminder(reminder: ItemReminder): Date {
  const [h, m] = reminder.time.split(':').map(Number);
  if (reminder.date) {
    const d = new Date(`${reminder.date}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d;
  }
  const d = getDateService().now();
  d.setHours(h, m, 0, 0);
  return d;
}

function liveEditDescription(freq: ReminderFrequency, date: Date, daysOfWeek: number[]): string {
  const timeStr = formatTimeFromHHMM(padTime(date.getHours(), date.getMinutes()));
  if (freq === 'weekdays') return `Weekdays at ${timeStr}`;
  if (freq === 'weekends') return `Weekends at ${timeStr}`;
  if (freq === 'weekly' && daysOfWeek.length) {
    const dayNames = daysOfWeek.map((d) => DAY_LABELS[d]).join(', ');
    return `${dayNames} at ${timeStr}`;
  }
  if (freq === 'daily') return `Daily at ${timeStr}`;
  return `${getDateService().formatForChip(getDateService().toLocalDate(date))} at ${timeStr}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SetRemindersModalProps {
  visible: boolean;
  onClose: () => void;
  reminders: ItemReminder[];
  onSave: (reminders: ItemReminder[]) => void;
  itemType: 'todo' | 'habit';
}

const MAX_REMINDERS = 3;

const FREQUENCY_OPTIONS: { value: ReminderFrequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Custom' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetRemindersModal({
  visible,
  onClose,
  reminders,
  onSave,
  itemType,
}: SetRemindersModalProps) {
  const [localReminders, setLocalReminders] = useState<ItemReminder[]>(reminders);
  // ID of the reminder currently being edited inline, or 'new' for a new custom reminder
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Edit state for the expanded reminder
  const [editFrequency, setEditFrequency] = useState<ReminderFrequency>('once');
  const [editDate, setEditDate] = useState<Date>(getDateService().now());
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<number[]>([]);
  const [visiblePicker, setVisiblePicker] = useState<'none' | 'date' | 'time'>('none');

  const todayMidnight = useMemo(() => getTodayMidnight(), []);

  // Sync from props when modal opens
  useEffect(() => {
    if (visible) {
      setLocalReminders(reminders);
      setExpandedId(null);
      setVisiblePicker('none');
    }
  }, [visible, reminders]);

  const atMax = localReminders.length >= MAX_REMINDERS;

  // ─── Inline edit helpers ───────────────────────────────────────────────

  // Pure helper: build the updated reminders array with the current edit applied.
  // Used by both commitEdit (to update local state) and handleSave (to pass the
  // synchronously-computed list to onSave, avoiding a stale-closure bug).
  const buildRemindersWithEdit = useCallback(
    (id: string): ItemReminder[] => {
      const time = padTime(editDate.getHours(), editDate.getMinutes());
      const y = editDate.getFullYear();
      const m = String(editDate.getMonth() + 1).padStart(2, '0');
      const d = String(editDate.getDate()).padStart(2, '0');

      const updated: ItemReminder = { id, time, frequency: editFrequency };
      if (editFrequency === 'once') {
        updated.date = `${y}-${m}-${d}`;
      }
      if (editFrequency === 'weekly') {
        updated.days_of_week = editDaysOfWeek;
      }

      if (id === 'new') {
        updated.id = makeId();
        return [...localReminders, updated];
      }
      return localReminders.map((r) => (r.id === id ? updated : r));
    },
    [editDate, editFrequency, editDaysOfWeek, localReminders],
  );

  const commitEdit = useCallback(
    (id: string) => {
      setLocalReminders(buildRemindersWithEdit(id));
      setExpandedId(null);
    },
    [buildRemindersWithEdit],
  );

  const toggleExpand = useCallback(
    (reminder: ItemReminder) => {
      if (expandedId === reminder.id) {
        // Collapse — commit the edit
        commitEdit(reminder.id);
      } else {
        // Switching rows — commit current edit first, then expand new one
        if (expandedId) {
          commitEdit(expandedId);
        }
        setExpandedId(reminder.id);
        setEditFrequency(reminder.frequency);
        setEditDaysOfWeek(reminder.days_of_week ?? []);
        setEditDate(dateFromReminder(reminder));
        setVisiblePicker('none');
      }
    },
    [expandedId, commitEdit],
  );

  const startNewCustom = useCallback(() => {
    if (atMax) return;
    const now = getDateService().now();
    now.setMinutes(roundToNearest(now.getMinutes(), 5), 0, 0);
    now.setHours(now.getHours() + 1);
    setEditFrequency('once');
    // Pre-set today's date so the user doesn't need to tap today to confirm it
    setEditDate(now);
    setEditDaysOfWeek([]);
    setExpandedId('new');
    setVisiblePicker('none');
  }, [atMax]);

  const removeReminder = useCallback(
    (id: string) => {
      setLocalReminders((prev) => prev.filter((r) => r.id !== id));
      if (expandedId === id) setExpandedId(null);
    },
    [expandedId],
  );

  const handleFrequencyChange = useCallback((freq: ReminderFrequency) => {
    setEditFrequency(freq);
    if (freq === 'weekly') {
      // Keep existing days or default empty
    }
  }, []);

  const toggleDay = useCallback((day: number) => {
    setEditDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }, []);

  const handleDateChange = useCallback((_event: any, selected?: Date) => {
    if (!selected) return;
    setEditDate((prev) => {
      const next = new Date(selected);
      // Preserve the time from the current edit state
      next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      return next;
    });
    // On iOS compact mode, collapse after selection
    setVisiblePicker('none');
  }, []);

  const handleTimeChange = useCallback((_event: any, selected?: Date) => {
    if (!selected) return;
    setEditDate((prev) => {
      const next = new Date(prev);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      return next;
    });
    // On iOS compact mode, collapse after selection
    setVisiblePicker('none');
  }, []);

  // ─── Quick add handlers (unchanged behavior) ──────────────────────────

  const handleIn1Hour = useCallback(() => {
    const now = getDateService().now();
    now.setHours(now.getHours() + 1);
    const mins = roundToNearest(now.getMinutes(), 5);
    now.setMinutes(mins, 0, 0);
    setLocalReminders((prev) => [
      ...prev,
      {
        id: makeId(),
        time: padTime(now.getHours(), now.getMinutes()),
        frequency: 'once' as const,
        date: getTodayDateString(),
      },
    ]);
  }, []);

  const handleTomorrowAM = useCallback(() => {
    setLocalReminders((prev) => [
      ...prev,
      { id: makeId(), time: '09:00', frequency: 'once' as const, date: getTomorrowDateString() },
    ]);
  }, []);

  const handleDaily = useCallback(() => {
    const now = getDateService().now();
    const mins = roundToNearest(now.getMinutes(), 15);
    setLocalReminders((prev) => [
      ...prev,
      {
        id: makeId(),
        time: padTime(now.getHours(), mins >= 60 ? 0 : mins),
        frequency: 'daily' as const,
      },
    ]);
  }, []);

  const handleSave = useCallback(() => {
    // Compute final list synchronously — if the editor is open, fold in the
    // pending edit so we don't pass stale state to onSave.
    const finalReminders = expandedId
      ? buildRemindersWithEdit(expandedId)
      : localReminders;
    onSave(finalReminders);
    onClose();
  }, [localReminders, onSave, onClose, expandedId, buildRemindersWithEdit]);

  // ─── Inline edit section renderer ──────────────────────────────────────

  const renderExpandedEditor = useCallback(
    () => (
      <View style={styles.expandedSection}>
        {/* Frequency chips */}
        <View style={styles.frequencyRow}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.frequencyChip,
                editFrequency === opt.value && styles.frequencyChipSelected,
              ]}
              onPress={() => handleFrequencyChange(opt.value)}
            >
              <Text
                style={[
                  styles.frequencyChipText,
                  editFrequency === opt.value && styles.frequencyChipTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Day-of-week chips (only for 'weekly' / custom) */}
        {editFrequency === 'weekly' && (
          <View style={styles.dayRow}>
            {DAY_LABELS.map((label, i) => (
              <Pressable
                key={i}
                style={[styles.dayChip, editDaysOfWeek.includes(i) && styles.dayChipSelected]}
                onPress={() => toggleDay(i)}
              >
                <Text
                  style={[
                    styles.dayChipText,
                    editDaysOfWeek.includes(i) && styles.dayChipTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Compact date + time picker pills — side by side */}
        <View style={styles.pickerPillRow}>
          {/* Date pill — only for 'once' */}
          {editFrequency === 'once' && (
            <View style={styles.pickerPillWrapper}>
              <DateTimePicker
                value={editDate}
                mode="date"
                display="compact"
                onChange={handleDateChange}
                minimumDate={todayMidnight}
                accentColor={BRAND.colors.mossGreen}
              />
            </View>
          )}

          {/* Time pill — always shown */}
          <View style={styles.pickerPillWrapper}>
            <DateTimePicker
              value={editDate}
              mode="time"
              display="compact"
              onChange={handleTimeChange}
              minuteInterval={5}
              accentColor={BRAND.colors.mossGreen}
            />
          </View>
        </View>
      </View>
    ),
    [
      editFrequency,
      editDaysOfWeek,
      editDate,
      todayMidnight,
      handleFrequencyChange,
      toggleDay,
      handleDateChange,
      handleTimeChange,
    ],
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Set Reminders</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={20} color={BRAND.colors.charcoalInk} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} bounces={false}>
            {/* Existing reminders */}
            {localReminders.length === 0 ? (
              <Text style={styles.emptyText}>No reminders set</Text>
            ) : (
              localReminders.map((r) => (
                <View key={r.id}>
                  {/* Tappable row — tap to expand/collapse edit */}
                  <Pressable
                    style={[styles.reminderRow, expandedId === r.id && styles.reminderRowExpanded]}
                    onPress={() => toggleExpand(r)}
                  >
                    <Bell size={16} color={BRAND.colors.mossGreen} />
                    <Text style={styles.reminderText}>
                      {expandedId === r.id
                        ? liveEditDescription(editFrequency, editDate, editDaysOfWeek)
                        : formatReminderDescription(r)}
                    </Text>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        removeReminder(r.id);
                      }}
                      hitSlop={12}
                    >
                      <Trash2 size={16} color={colors.text.secondary} />
                    </Pressable>
                  </Pressable>
                  {/* Inline expanded editor */}
                  {expandedId === r.id && renderExpandedEditor()}
                </View>
              ))
            )}

            {/* New custom reminder inline editor */}
            {expandedId === 'new' && (
              <View>
                <View style={[styles.reminderRow, styles.reminderRowExpanded]}>
                  <Bell size={16} color={BRAND.colors.mossGreen} />
                  <Text style={styles.reminderText}>
                    {liveEditDescription(editFrequency, editDate, editDaysOfWeek)}
                  </Text>
                </View>
                {renderExpandedEditor()}
              </View>
            )}

            {/* Quick options */}
            <Text style={styles.sectionLabel}>Quick add</Text>
            <View style={styles.pillRow}>
              <Pressable
                style={[styles.pill, atMax && styles.pillDisabled]}
                onPress={handleIn1Hour}
                disabled={atMax}
              >
                <Clock size={14} color={BRAND.colors.mossGreen} />
                <Text style={styles.pillText}>In 1 hour</Text>
              </Pressable>
              <Pressable
                style={[styles.pill, atMax && styles.pillDisabled]}
                onPress={handleTomorrowAM}
                disabled={atMax}
              >
                <AlarmClock size={14} color={BRAND.colors.mossGreen} />
                <Text style={styles.pillText}>Tomorrow AM</Text>
              </Pressable>
              <Pressable
                style={[styles.pill, atMax && styles.pillDisabled]}
                onPress={handleDaily}
                disabled={atMax}
              >
                <Repeat size={14} color={BRAND.colors.mossGreen} />
                <Text style={styles.pillText}>Daily</Text>
              </Pressable>
            </View>

            {atMax && expandedId !== 'new' && (
              <Text style={styles.maxText}>Maximum 3 reminders</Text>
            )}

            {/* Custom reminder button */}
            {expandedId !== 'new' && (
              <Pressable
                style={[styles.customButton, atMax && styles.pillDisabled]}
                onPress={startNewCustom}
                disabled={atMax}
              >
                <Plus size={16} color={BRAND.colors.mossGreen} />
                <Text style={styles.customButtonText}>Custom reminder</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.base,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: BRAND.colors.charcoalInk,
  },
  body: {
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
  },
  reminderRowExpanded: {
    borderBottomWidth: 0,
  },
  reminderText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },
  expandedSection: {
    backgroundColor: `${BRAND.colors.sageMist}26`, // ~15% opacity
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillDisabled: {
    opacity: 0.4,
  },
  pillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: BRAND.colors.mossGreen,
  },
  maxText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  customButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.base,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BRAND.colors.mossGreen,
    borderRadius: borderRadius.lg,
  },
  customButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.mossGreen,
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  frequencyChip: {
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  frequencyChipSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.mossGreen,
  },
  frequencyChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: BRAND.colors.mossGreen,
  },
  frequencyChipTextSelected: {
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-SemiBold',
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  dayChipSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.mossGreen,
  },
  dayChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: BRAND.colors.mossGreen,
  },
  dayChipTextSelected: {
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-SemiBold',
  },
  pickerPillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  pickerPillWrapper: {
    // iOS compact DateTimePicker renders as a small tappable label
    // that opens a native popover — minimal vertical footprint
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  saveButton: {
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
