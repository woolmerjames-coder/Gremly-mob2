import React, { useState, useCallback, useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { X, Bell, Plus, Trash2, Clock, AlarmClock, Repeat } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import { colors, spacing, borderRadius } from '../../design/tokens';
import type { ItemReminder } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeFromHHMM(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatReminderDescription(reminder: ItemReminder): string {
  const timeStr = formatTimeFromHHMM(reminder.time);
  if (reminder.frequency === 'daily') {
    return `Daily at ${timeStr}`;
  }
  if (reminder.date) {
    const d = new Date(`${reminder.date}T00:00:00`);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day} at ${timeStr}`;
  }
  return `At ${timeStr}`;
}

function roundToNearest(minutes: number, interval: number): number {
  return Math.round(minutes / interval) * interval;
}

function getTodayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeId(): string {
  return `reminder-${Date.now()}`;
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetRemindersModal({
  visible,
  onClose,
  reminders,
  onSave,
  itemType,
}: SetRemindersModalProps) {
  const [localReminders, setLocalReminders] = useState<ItemReminder[]>(reminders);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [customPickerStep, setCustomPickerStep] = useState<'date' | 'time'>('date');

  // Sync from props when modal opens
  useEffect(() => {
    if (visible) {
      setLocalReminders(reminders);
      setShowCustomPicker(false);
      setCustomPickerStep('date');
    }
  }, [visible, reminders]);

  const atMax = localReminders.length >= MAX_REMINDERS;

  const addReminder = useCallback(
    (r: ItemReminder) => {
      if (localReminders.length >= MAX_REMINDERS) return;
      setLocalReminders((prev) => [...prev, r]);
    },
    [localReminders.length],
  );

  const removeReminder = useCallback((id: string) => {
    setLocalReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleIn1Hour = useCallback(() => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const mins = roundToNearest(now.getMinutes(), 5);
    now.setMinutes(mins, 0, 0);
    addReminder({
      id: makeId(),
      time: padTime(now.getHours(), now.getMinutes()),
      frequency: 'once',
      date: getTodayDateString(),
    });
  }, [addReminder]);

  const handleTomorrowAM = useCallback(() => {
    addReminder({
      id: makeId(),
      time: '09:00',
      frequency: 'once',
      date: getTomorrowDateString(),
    });
  }, [addReminder]);

  const handleDaily = useCallback(() => {
    const now = new Date();
    const mins = roundToNearest(now.getMinutes(), 15);
    addReminder({
      id: makeId(),
      time: padTime(now.getHours(), mins >= 60 ? 0 : mins),
      frequency: 'daily',
    });
  }, [addReminder]);

  const handleCustomPress = useCallback(() => {
    setCustomDate(new Date());
    setCustomPickerStep('date');
    setShowCustomPicker(true);
  }, []);

  const handleCustomDateChange = useCallback(
    (_event: any, selected?: Date) => {
      if (!selected) {
        // Android cancel
        if (Platform.OS === 'android') setShowCustomPicker(false);
        return;
      }
      setCustomDate(selected);
      if (customPickerStep === 'date') {
        setCustomPickerStep('time');
      } else {
        // Time selected — finalize
        const y = selected.getFullYear();
        const m = String(selected.getMonth() + 1).padStart(2, '0');
        const d = String(selected.getDate()).padStart(2, '0');
        addReminder({
          id: makeId(),
          time: padTime(selected.getHours(), selected.getMinutes()),
          frequency: 'once',
          date: `${y}-${m}-${d}`,
        });
        setShowCustomPicker(false);
      }
    },
    [customPickerStep, addReminder],
  );

  const handleSave = useCallback(() => {
    onSave(localReminders);
    onClose();
  }, [localReminders, onSave, onClose]);

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
                <View key={r.id} style={styles.reminderRow}>
                  <Bell size={16} color={BRAND.colors.mossGreen} />
                  <Text style={styles.reminderText}>{formatReminderDescription(r)}</Text>
                  <Pressable onPress={() => removeReminder(r.id)} hitSlop={10}>
                    <Trash2 size={16} color={colors.text.secondary} />
                  </Pressable>
                </View>
              ))
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

            {atMax && <Text style={styles.maxText}>Maximum 3 reminders</Text>}

            {/* Custom reminder */}
            <Pressable
              style={[styles.customButton, atMax && styles.pillDisabled]}
              onPress={handleCustomPress}
              disabled={atMax}
            >
              <Plus size={16} color={BRAND.colors.mossGreen} />
              <Text style={styles.customButtonText}>Custom reminder</Text>
            </Pressable>

            {showCustomPicker && (
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerLabel}>
                  {customPickerStep === 'date' ? 'Pick a date' : 'Pick a time'}
                </Text>
                <DateTimePicker
                  value={customDate}
                  mode={customPickerStep}
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={handleCustomDateChange}
                  minimumDate={new Date()}
                  accentColor={BRAND.colors.mossGreen}
                />
              </View>
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
    maxHeight: '80%',
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
  reminderText: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
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
  pickerContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  pickerLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  saveButton: {
    backgroundColor: BRAND.colors.charcoalInk,
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
