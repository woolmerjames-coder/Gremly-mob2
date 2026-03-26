import React, { useState, useEffect, useCallback } from 'react';
import { View, Pressable, Modal, ScrollView, Switch, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addDays, setHours, setMinutes, nextMonday, isSameDay } from 'date-fns';
import { CheckSquare, FileText, Repeat } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, Box } from '../../ui';
import { BRAND } from '../../design/brand';
import { parseDayString } from '../../lib/date/computeDueDay';
import { SweepCardShell } from './SweepCardShell';
import { TodoActionZone } from './TodoActionZone';
import { WrongTypePicker } from './WrongTypePicker';
import { SweepConversionToast } from './SweepConversionToast';
import type { SweepCandidate, SweepCardMeta } from '../../lib/sweep/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_TIMES = [
  { label: '9:00 AM', hour: 9, minute: 0, key: '9:00-AM' },
  { label: '12:00 PM', hour: 12, minute: 0, key: '12:00-PM' },
  { label: '3:00 PM', hour: 15, minute: 0, key: '3:00-PM' },
  { label: '6:00 PM', hour: 18, minute: 0, key: '6:00-PM' },
  { label: '9:00 PM', hour: 21, minute: 0, key: '9:00-PM' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SweepCardNewProps = {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
  index: number;
  total: number;
  isConverted?: boolean;
  isClarified?: boolean;
  onSkip: () => void;
  onClear: () => void;
  onOpenEdit: () => void;
  onConvertToTodo?: () => void;
  onConfirmQuickDate?: (option: 'tomorrow' | 'nextweek') => void;
  onConfirmRemindLater?: (date: Date) => void;
  onConfirmCustomDate?: (date: Date) => void;
  onAddToSpace?: (spaceId: string) => void;
  onConfirmHabitStart?: (
    action: 'asktomorrow' | 'starttomorrow' | 'startmonday',
    customDate?: Date,
  ) => void;
  onClose?: () => void;
  hideBottomSaveExit?: boolean;
  onSwipeProgress?: (progress: number) => void;
  onGoBack?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previousDecision?: any;
  onOpenChat?: (presetHint?: string) => void;
  onShowHelp?: () => void;
  onConvertToType?: (newType: 'todo' | 'note' | 'habit') => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SweepCardNew({
  candidate,
  meta,
  onSkip,
  onClear,
  onOpenEdit,
  onConfirmQuickDate,
  onConfirmRemindLater,
  onConfirmCustomDate,
  isConverted,
  isClarified,
  previousDecision,
  onOpenChat,
  onShowHelp,
  onConvertToType,
}: SweepCardNewProps) {
  // ── Action zone state ──
  const [selectedAction, setSelectedAction] = useState<'tomorrow' | 'nextweek' | 'pickdate'>(
    'tomorrow',
  );
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<
    'daybefore' | 'morning' | 'custom' | null
  >(null);
  const [confirmedCustomDate, setConfirmedCustomDate] = useState<Date | null>(null);
  const [confirmedReminderDate, setConfirmedReminderDate] = useState<Date | null>(null);

  // ── Date picker state ──
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'duedate' | 'remind'>('duedate');
  const [selectedDate, setSelectedDate] = useState(() => {
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
      return parsed || new Date();
    }
    return new Date();
  });
  const [clearDateFlag, setClearDateFlag] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [selectedTimePreset, setSelectedTimePreset] = useState<string | null>(null);
  const [showWrongTypePicker, setShowWrongTypePicker] = useState(false);
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);

  // ── Reset on candidate change + restore previousDecision ──
  useEffect(() => {
    // Reset all state
    setSelectedAction('tomorrow');
    setReminderEnabled(false);
    setSelectedReminder(null);
    setConfirmedCustomDate(null);
    setConfirmedReminderDate(null);
    setShowDatePicker(false);
    setDatePickerMode('duedate');
    setClearDateFlag(false);
    setShowTimePicker(false);
    setSelectedTimePreset(null);

    // Restore from previousDecision
    if (previousDecision?.dueDate) {
      const tomorrow = addDays(new Date(), 1);
      const monday = nextMonday(new Date());

      if (isSameDay(previousDecision.dueDate, tomorrow)) {
        setSelectedAction('tomorrow');
      } else if (isSameDay(previousDecision.dueDate, monday)) {
        setSelectedAction('nextweek');
      } else {
        setSelectedAction('pickdate');
        setConfirmedCustomDate(previousDecision.dueDate);
      }
    }

    // Pre-fill date from candidate
    if (candidate.kind === 'todo' && candidate.raw.due_day) {
      const parsed = parseDayString(candidate.raw.due_day);
      setSelectedDate(parsed || new Date());
    } else {
      setSelectedDate(new Date());
    }
  }, [candidate.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Conversion toast ──
  useEffect(() => {
    if (isConverted) {
      const timer = setTimeout(() => {
        const msg =
          candidate.kind === 'todo'
            ? 'Now a Todo'
            : candidate.kind === 'note'
              ? 'Now a Note'
              : 'Now a Habit';
        setConversionMessage(msg);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [isConverted, candidate.kind]);

  // ── Type whisper / icon / badge ──
  const typeConfig = getTypeConfig(candidate);

  // ── Gremly menu handler ──
  const handleGremlyMenuItem = useCallback(
    (key: 'help' | 'chat' | 'details' | 'wrongtype') => {
      switch (key) {
        case 'help':
          onShowHelp?.();
          break;
        case 'chat':
          onOpenChat?.(
            candidate.kind === 'todo'
              ? 'Help me figure out what to do with this task'
              : candidate.kind === 'note'
                ? 'Help me organize this note'
                : 'Help me with this habit',
          );
          break;
        case 'details':
          onOpenEdit();
          break;
        case 'wrongtype':
          setShowWrongTypePicker(true);
          break;
      }
    },
    [candidate.kind, onOpenChat, onOpenEdit, onShowHelp, onConvertToType],
  );

  // ── Swipe handlers ──
  const handleSwipeRight = useCallback(() => {
    if (candidate.kind === 'todo') {
      if (selectedAction === 'tomorrow' || selectedAction === 'nextweek') {
        onConfirmQuickDate?.(selectedAction);
      } else if (selectedAction === 'pickdate' && confirmedCustomDate) {
        onConfirmCustomDate?.(confirmedCustomDate);
      } else {
        onSkip();
      }

      if (reminderEnabled && selectedReminder !== null && confirmedReminderDate) {
        console.warn('[SweepCardNew] Reminder set but not yet wired to commit alongside schedule');
      }
    } else {
      // Notes and habits: Phase 1 placeholder
      onSkip();
    }
  }, [
    candidate.kind,
    selectedAction,
    confirmedCustomDate,
    reminderEnabled,
    selectedReminder,
    confirmedReminderDate,
    onConfirmQuickDate,
    onConfirmCustomDate,
    onSkip,
  ]);

  const handleSwipeLeft = useCallback(() => {
    onClear();
  }, [onClear]);

  // ── Date picker handlers ──
  const handleDateConfirm = useCallback(() => {
    if (datePickerMode === 'remind') {
      setConfirmedReminderDate(selectedDate);
      setSelectedReminder('custom');
    } else {
      setConfirmedCustomDate(selectedDate);
      setSelectedAction('pickdate');
    }
    setShowDatePicker(false);
    setClearDateFlag(false);
    setShowTimePicker(false);
    setSelectedTimePreset(null);
  }, [selectedDate, datePickerMode]);

  const handleDateCancel = useCallback(() => {
    setShowDatePicker(false);
    setClearDateFlag(false);
    setShowTimePicker(false);
    setSelectedTimePreset(null);
  }, []);

  const isRemindMode = datePickerMode === 'remind';

  return (
    <>
      <View style={styles.cardOverlayContainer}>
        <SweepCardShell
          candidate={candidate}
          meta={meta}
          typeWhisper={typeConfig.whisper}
          typeIcon={typeConfig.icon}
          badge={typeConfig.badge}
          onSwipeRight={handleSwipeRight}
          onSwipeLeft={handleSwipeLeft}
          onGremlyMenuItem={handleGremlyMenuItem}
          isConverted={isConverted}
          isClarified={isClarified}
        >
          {candidate.kind === 'todo' && (
            <TodoActionZone
              candidate={candidate}
              meta={meta}
              selectedAction={selectedAction}
              onSelectAction={setSelectedAction}
              reminderEnabled={reminderEnabled}
              selectedReminder={selectedReminder}
              onToggleReminder={() => setReminderEnabled(!reminderEnabled)}
              onSelectReminder={setSelectedReminder}
              confirmedCustomDate={
                confirmedCustomDate ? format(confirmedCustomDate, 'MMM d') : null
              }
              onRequestDatePicker={() => {
                setDatePickerMode('duedate');
                setShowDatePicker(true);
              }}
              onRequestReminderDatePicker={() => {
                setDatePickerMode('remind');
                setShowDatePicker(true);
              }}
            />
          )}
          {candidate.kind === 'note' && (
            <View style={styles.placeholderZone}>
              <Text style={styles.placeholderText}>Note actions coming in Phase 2</Text>
            </View>
          )}
        </SweepCardShell>

        <WrongTypePicker
          visible={showWrongTypePicker}
          currentType={candidate.kind}
          onSelect={(newType) => {
            setShowWrongTypePicker(false);
            if (newType === 'delete') {
              onClear();
            } else {
              onConvertToType?.(newType);
            }
          }}
          onClose={() => setShowWrongTypePicker(false)}
        />

        <SweepConversionToast
          visible={conversionMessage !== null}
          message={conversionMessage || ''}
          onDismissed={() => setConversionMessage(null)}
        />
      </View>

      {/* Date picker modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <Pressable style={styles.dateModalBackdrop} onPress={handleDateCancel}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.dateModalContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={true}
              contentContainerStyle={styles.dateModalScroll}
            >
              <Text style={styles.dateModalTitle}>
                {isRemindMode ? 'Reminder date' : 'Set due date'}
              </Text>

              {/* Quick date chips */}
              <Box mt={1}>
                <Box row gap={2} style={{ flexWrap: 'wrap' }}>
                  {isRemindMode ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setSelectedDate(addDays(new Date(), 1));
                          setClearDateFlag(false);
                        }}
                        style={({ pressed }) => [
                          styles.dateChip,
                          pressed && styles.dateChipPressed,
                          !clearDateFlag &&
                            selectedDate.toDateString() === addDays(new Date(), 1).toDateString() &&
                            styles.dateChipSelected,
                        ]}
                      >
                        <Text style={styles.dateChipText}>Tomorrow</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedDate(addDays(new Date(), 7));
                          setClearDateFlag(false);
                        }}
                        style={({ pressed }) => [
                          styles.dateChip,
                          pressed && styles.dateChipPressed,
                          !clearDateFlag &&
                            selectedDate.toDateString() === addDays(new Date(), 7).toDateString() &&
                            styles.dateChipSelected,
                        ]}
                      >
                        <Text style={styles.dateChipText}>Next Week</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setSelectedDate(new Date());
                          setClearDateFlag(false);
                        }}
                        style={({ pressed }) => [
                          styles.dateChip,
                          pressed && styles.dateChipPressed,
                          !clearDateFlag &&
                            selectedDate.toDateString() === new Date().toDateString() &&
                            styles.dateChipSelected,
                        ]}
                      >
                        <Text style={styles.dateChipText}>Today</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedDate(addDays(new Date(), 1));
                          setClearDateFlag(false);
                        }}
                        style={({ pressed }) => [
                          styles.dateChip,
                          pressed && styles.dateChipPressed,
                          !clearDateFlag &&
                            selectedDate.toDateString() === addDays(new Date(), 1).toDateString() &&
                            styles.dateChipSelected,
                        ]}
                      >
                        <Text style={styles.dateChipText}>Tomorrow</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setClearDateFlag(true);
                          setShowTimePicker(false);
                          setSelectedTimePreset(null);
                        }}
                        style={({ pressed }) => [
                          styles.dateChip,
                          pressed && styles.dateChipPressed,
                          clearDateFlag && styles.dateChipSelected,
                        ]}
                      >
                        <Text style={styles.dateChipText}>Clear</Text>
                      </Pressable>
                    </>
                  )}
                </Box>
              </Box>

              {/* Date picker */}
              {!clearDateFlag && (
                <Box mt={3} mb={4}>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(_event, date) => {
                      if (date) {
                        setSelectedDate(date);
                        setClearDateFlag(false);
                      }
                    }}
                    themeVariant="light"
                    accentColor={BRAND.colors.mossGreen}
                  />
                </Box>
              )}

              {/* Time toggle - todos only, due date mode only */}
              {!clearDateFlag && !isRemindMode && candidate.kind === 'todo' && (
                <Box mt={3} mb={4}>
                  <Box row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.timeToggleLabel}>Add time?</Text>
                    <Switch
                      value={showTimePicker}
                      onValueChange={(value) => {
                        setShowTimePicker(value);
                        if (value && !selectedTimePreset) {
                          setSelectedTimePreset(PRESET_TIMES[0].key);
                          const defaultTime = setHours(setMinutes(new Date(), 0), 9);
                          setSelectedTime(defaultTime);
                        } else if (!value) {
                          setSelectedTimePreset(null);
                        }
                      }}
                      trackColor={{ false: '#E0E0E0', true: BRAND.colors.mossGreen }}
                      thumbColor="#FFFFFF"
                    />
                  </Box>

                  {showTimePicker && (
                    <Box mt={3}>
                      <Box row style={{ flexWrap: 'wrap', rowGap: 8, columnGap: 8 }}>
                        {PRESET_TIMES.map((preset) => (
                          <Pressable
                            key={preset.key}
                            onPress={() => {
                              setSelectedTimePreset(preset.key);
                              const newTime = setHours(
                                setMinutes(new Date(), preset.minute),
                                preset.hour,
                              );
                              setSelectedTime(newTime);
                            }}
                            style={({ pressed }) => [
                              styles.dateChip,
                              pressed && styles.dateChipPressed,
                              selectedTimePreset === preset.key && styles.dateChipSelected,
                            ]}
                          >
                            <Text style={styles.dateChipText}>{preset.label}</Text>
                          </Pressable>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}

              {/* Action buttons */}
              <View style={styles.dateModalActions}>
                <Pressable style={styles.dateModalCancelButton} onPress={handleDateCancel}>
                  <Text style={styles.dateModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.dateModalConfirmButton} onPress={handleDateConfirm}>
                  <Text style={styles.dateModalConfirmText}>{clearDateFlag ? 'Clear' : 'Set'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getTypeConfig(candidate: SweepCandidate) {
  switch (candidate.kind) {
    case 'todo':
      return {
        whisper: 'TODO',
        icon: <CheckSquare size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />,
        badge: undefined,
      };
    case 'note':
      return {
        whisper: 'NOTE',
        icon: <FileText size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />,
        badge: undefined,
      };
    case 'habit':
      return {
        whisper: 'HABIT',
        icon: <Repeat size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />,
        badge: undefined,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardOverlayContainer: {
    flex: 1,
    position: 'relative',
  },
  placeholderZone: {
    padding: 22,
  },
  placeholderText: {
    fontSize: 14,
    color: 'rgba(34,34,34,0.45)',
  },

  // Date picker modal (ported from SweepCard)
  dateModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dateModalContent: {
    width: '92%',
    maxWidth: 400,
    maxHeight: '85%',
    alignSelf: 'center',
    backgroundColor: BRAND.colors.linenCream,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: BRAND.radius.xl,
    borderWidth: 1,
    borderColor: BRAND.colors.sageMist,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 12,
  },
  dateModalScroll: {
    paddingBottom: 32,
    paddingTop: 4,
  },
  dateModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  dateChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BRAND.radius.pill,
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    borderWidth: 1.5,
    borderColor: BRAND.colors.sageMist,
  },
  dateChipPressed: {
    backgroundColor: 'rgba(191, 216, 192, 0.35)',
  },
  dateChipSelected: {
    backgroundColor: BRAND.colors.sageMist,
    borderColor: BRAND.colors.mossGreen,
    borderWidth: 2,
  },
  dateChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  timeToggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  dateModalActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
  },
  dateModalCancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    backgroundColor: 'rgba(34, 34, 34, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34, 34, 34, 0.1)',
  },
  dateModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.inkSubtle,
  },
  dateModalConfirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: BRAND.radius.md,
    backgroundColor: BRAND.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateModalConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
