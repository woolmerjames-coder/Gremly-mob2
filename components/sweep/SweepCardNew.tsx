import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Pressable,
  Modal,
  ScrollView,
  Switch,
  Platform,
  StyleSheet,
  FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addDays, subDays, setHours, setMinutes, nextMonday, isSameDay } from 'date-fns';
import {
  CheckSquare,
  FileText,
  Repeat,
  Lightbulb,
  CalendarCheck,
  RotateCcw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text, Box } from '../../ui';
import { BRAND } from '../../design/brand';
import { parseDayString } from '../../lib/date/computeDueDay';
import { getDateService } from '../../lib/date';
import { useActiveSpaces } from '../../lib/store/selectors';
import { SweepCardShell } from './SweepCardShell';
import { TodoActionZone } from './TodoActionZone';
import { IdeaActionZone } from './IdeaActionZone';
import { GeneralNoteActionZone } from './GeneralNoteActionZone';
import { EventActionZone } from './EventActionZone';
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
  onClose?: () => void;
  onGoBack?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previousDecision?: any;
  onOpenChat?: (presetHint?: string) => void;
  onShowHelp?: () => void;
  onConvertToType?: (newType: 'todo' | 'note' | 'habit' | 'delete') => void;
  onUpdateEventDate?: (date: Date) => void;
  onRequestPhotoPreview?: (url: string) => void;
  onConfirmTodoAction?: (action: {
    dueDateStr: string;
    reminderDateStr?: string;
    reminderTime?: string;
  }) => void;
  onConfirmEventAction?: (action: {
    reminderDateStr: string;
    reminderTime?: string;
    spaceId?: string;
    eventReminder?: 'daybefore' | 'weekbefore' | 'custom';
  }) => void;
  onConfirmNoteAction?: (action: {
    noteAction: 'fine' | 'resurface';
    resurfaceDateStr?: string;
    reminderDateStr?: string;
    spaceId?: string;
    resurfaceTiming?: 'nextweek' | '2weeks' | 'pick';
    eventReminder?: 'daybefore' | 'weekbefore' | 'custom';
  }) => void;
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
  onConvertToTodo,
  onUpdateEventDate,
  onRequestPhotoPreview,
  onAddToSpace,
  onConfirmTodoAction,
  onConfirmEventAction,
  onConfirmNoteAction,
}: SweepCardNewProps) {
  const spaces = useActiveSpaces();
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
  const [datePickerMode, setDatePickerMode] = useState<
    'duedate' | 'remind' | 'resurface' | 'eventremind' | 'eventdate'
  >('duedate');
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

  // ── Note action zone state ──
  const [noteAction, setNoteAction] = useState<'resurface' | 'maketodo' | 'fine'>(
    meta.noteCardType === 'idea' ? 'resurface' : 'fine',
  );
  const [resurfaceTiming, setResurfaceTiming] = useState<'nextweek' | '2weeks' | 'pick' | null>(
    'nextweek',
  );
  const [confirmedResurfaceDate, setConfirmedResurfaceDate] = useState<Date | null>(null);
  const [eventReminder, setEventReminder] = useState<'daybefore' | 'weekbefore' | 'custom'>(
    'daybefore',
  );
  const [confirmedEventReminderDate, setConfirmedEventReminderDate] = useState<Date | null>(null);
  const [overriddenEventDate, setOverriddenEventDate] = useState<Date | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedSpaceName, setSelectedSpaceName] = useState<string | null>(null);
  const [showSpacePicker, setShowSpacePicker] = useState(false);

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
    setNoteAction(meta.noteCardType === 'idea' ? 'resurface' : 'fine');
    setResurfaceTiming('nextweek');
    setConfirmedResurfaceDate(null);
    setEventReminder('daybefore');
    setConfirmedEventReminderDate(null);
    setSelectedSpaceId(null);
    setSelectedSpaceName(null);
    setShowSpacePicker(false);

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

    // Restore note-specific state
    if (previousDecision?.noteAction) {
      setNoteAction(previousDecision.noteAction);
    }
    if (previousDecision?.resurfaceTiming) {
      setResurfaceTiming(previousDecision.resurfaceTiming);
    }
    if (previousDecision?.spaceId) {
      setSelectedSpaceId(previousDecision.spaceId);
      const space = spaces.find((s: any) => s.id === previousDecision.spaceId);
      if (space) setSelectedSpaceName(space.name);
    }
    if (previousDecision?.eventReminder) {
      setEventReminder(previousDecision.eventReminder);
    }
    if (previousDecision?.reminderDateStr) {
      setReminderEnabled(true);
      if (
        previousDecision.reminderTime === '08:00' &&
        previousDecision.reminderDateStr === previousDecision.dueDateStr
      ) {
        setSelectedReminder('morning');
      } else {
        setSelectedReminder('daybefore');
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
        const msg = candidate.kind === 'todo' ? 'Now a Todo' : 'Now a Note';
        setConversionMessage(msg);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [isConverted, candidate.kind]);

  // ── Type whisper / icon / badge ──
  const typeConfig = getTypeConfig(candidate, meta);

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
              : 'Help me organize this note',
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
      // Compute due date string
      const ds = getDateService();
      let dueDateStr: string | null = null;
      if (selectedAction === 'tomorrow') {
        dueDateStr = ds.tomorrow();
      } else if (selectedAction === 'nextweek') {
        dueDateStr = ds.toLocalDate(ds.getNextWeekday(1));
      } else if (selectedAction === 'pickdate' && confirmedCustomDate) {
        dueDateStr = ds.toLocalDate(confirmedCustomDate);
      }

      if (dueDateStr) {
        // Build reminder info if enabled
        let reminderDateStr: string | undefined;
        let reminderTime: string | undefined;
        if (reminderEnabled && selectedReminder) {
          if (selectedReminder === 'daybefore') {
            const dueDate = new Date(dueDateStr + 'T12:00:00');
            reminderDateStr = ds.toLocalDate(subDays(dueDate, 1));
            reminderTime = '09:00';
          } else if (selectedReminder === 'morning') {
            reminderDateStr = dueDateStr;
            reminderTime = '08:00';
          } else if (selectedReminder === 'custom' && confirmedReminderDate) {
            reminderDateStr = ds.toLocalDate(confirmedReminderDate);
            reminderTime = '09:00';
          }
        }
        onConfirmTodoAction?.({
          dueDateStr,
          reminderDateStr,
          reminderTime,
        });
      } else {
        onSkip();
      }
    } else if (candidate.kind === 'note' && meta.noteCardType === 'event') {
      // Event notes: compute reminder date string for push notification
      const eventDateStr = overriddenEventDate
        ? getDateService().toLocalDate(overriddenEventDate)
        : meta.eventDate || null;

      if (!eventDateStr) {
        onSkip();
        return;
      }

      const ds = getDateService();
      const eventDate = new Date(eventDateStr + 'T12:00:00');
      let reminderDateStr: string;

      if (eventReminder === 'daybefore') {
        reminderDateStr = ds.toLocalDate(subDays(eventDate, 1));
      } else if (eventReminder === 'weekbefore') {
        reminderDateStr = ds.toLocalDate(subDays(eventDate, 7));
      } else if (eventReminder === 'custom' && confirmedEventReminderDate) {
        reminderDateStr = ds.toLocalDate(confirmedEventReminderDate);
      } else {
        reminderDateStr = ds.toLocalDate(subDays(eventDate, 1));
      }

      onConfirmEventAction?.({
        reminderDateStr,
        reminderTime: '09:00',
        spaceId: selectedSpaceId ?? undefined,
        eventReminder,
      });
    } else if (candidate.kind === 'note') {
      // Idea / general notes
      if (noteAction === 'maketodo') {
        // Already converted via onConvertToTodo in onSelectAction — just advance
        onSkip();
      } else if (noteAction === 'resurface') {
        const ds = getDateService();
        let resurfaceDateStr: string | undefined;
        if (resurfaceTiming === 'nextweek') {
          resurfaceDateStr = ds.toLocalDate(addDays(new Date(), 7));
        } else if (resurfaceTiming === '2weeks') {
          resurfaceDateStr = ds.toLocalDate(addDays(new Date(), 14));
        } else if (resurfaceTiming === 'pick' && confirmedResurfaceDate) {
          resurfaceDateStr = ds.toLocalDate(confirmedResurfaceDate);
        }
        onConfirmNoteAction?.({
          noteAction: 'resurface',
          resurfaceDateStr,
          spaceId: selectedSpaceId ?? undefined,
          resurfaceTiming: resurfaceTiming ?? undefined,
        });
      } else {
        // fine — mark as swept with optional space
        onConfirmNoteAction?.({
          noteAction: 'fine',
          spaceId: selectedSpaceId ?? undefined,
        });
      }
    } else {
      // Unsupported kind (e.g. habit) — skip
      onSkip();
    }
  }, [
    candidate.kind,
    meta.noteCardType,
    meta.eventDate,
    selectedAction,
    confirmedCustomDate,
    reminderEnabled,
    selectedReminder,
    confirmedReminderDate,
    selectedTimePreset,
    noteAction,
    resurfaceTiming,
    confirmedResurfaceDate,
    eventReminder,
    confirmedEventReminderDate,
    selectedSpaceId,
    onConfirmTodoAction,
    onConfirmEventAction,
    onConfirmNoteAction,
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
    } else if (datePickerMode === 'resurface') {
      setConfirmedResurfaceDate(selectedDate);
      setResurfaceTiming('pick');
    } else if (datePickerMode === 'eventremind') {
      setConfirmedEventReminderDate(selectedDate);
      setEventReminder('custom');
    } else if (datePickerMode === 'eventdate') {
      setOverriddenEventDate(selectedDate);
      onUpdateEventDate?.(selectedDate);
    } else {
      setConfirmedCustomDate(selectedDate);
      setSelectedAction('pickdate');
    }
    setShowDatePicker(false);
    setClearDateFlag(false);
    setShowTimePicker(false);
    setSelectedTimePreset(null);
  }, [selectedDate, datePickerMode, onUpdateEventDate]);

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
          onRequestPhotoPreview={onRequestPhotoPreview}
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
          {candidate.kind === 'note' && meta.noteCardType === 'idea' && (
            <IdeaActionZone
              candidate={candidate}
              meta={meta}
              selectedAction={noteAction}
              onSelectAction={(action) => {
                setNoteAction(action);
                if (action === 'maketodo') {
                  onConvertToTodo?.();
                }
              }}
              selectedResurfaceTiming={resurfaceTiming}
              onSelectResurfaceTiming={setResurfaceTiming}
              confirmedResurfaceDate={
                confirmedResurfaceDate ? format(confirmedResurfaceDate, 'MMM d') : null
              }
              onRequestResurfaceDatePicker={() => {
                setDatePickerMode('resurface');
                setShowDatePicker(true);
              }}
              selectedSpaceId={selectedSpaceId}
              selectedSpaceName={selectedSpaceName}
              onRequestSpacePicker={() => setShowSpacePicker(true)}
              onClearSpace={() => {
                setSelectedSpaceId(null);
                setSelectedSpaceName(null);
              }}
            />
          )}
          {candidate.kind === 'note' && meta.noteCardType === 'general' && (
            <GeneralNoteActionZone
              candidate={candidate}
              meta={meta}
              selectedAction={noteAction}
              onSelectAction={(action) => {
                setNoteAction(action);
                if (action === 'maketodo') {
                  onConvertToTodo?.();
                }
              }}
              selectedResurfaceTiming={resurfaceTiming}
              onSelectResurfaceTiming={setResurfaceTiming}
              confirmedResurfaceDate={
                confirmedResurfaceDate ? format(confirmedResurfaceDate, 'MMM d') : null
              }
              onRequestResurfaceDatePicker={() => {
                setDatePickerMode('resurface');
                setShowDatePicker(true);
              }}
              selectedSpaceId={selectedSpaceId}
              selectedSpaceName={selectedSpaceName}
              onRequestSpacePicker={() => setShowSpacePicker(true)}
              onClearSpace={() => {
                setSelectedSpaceId(null);
                setSelectedSpaceName(null);
              }}
            />
          )}
          {candidate.kind === 'note' && meta.noteCardType === 'event' && (
            <EventActionZone
              candidate={candidate}
              meta={meta}
              selectedReminder={eventReminder}
              onSelectReminder={setEventReminder}
              confirmedCustomReminderDate={
                confirmedEventReminderDate ? format(confirmedEventReminderDate, 'MMM d') : null
              }
              onRequestReminderDatePicker={() => {
                setDatePickerMode('eventremind');
                setShowDatePicker(true);
              }}
              onRequestEditEventDate={() => {
                setDatePickerMode('eventdate');
                setShowDatePicker(true);
              }}
              eventDateOverride={
                overriddenEventDate ? format(overriddenEventDate, 'EEE, MMM d') : undefined
              }
              daysUntilEventOverride={
                overriddenEventDate
                  ? Math.round(
                      (overriddenEventDate.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
                    )
                  : undefined
              }
              selectedSpaceId={selectedSpaceId}
              selectedSpaceName={selectedSpaceName}
              onRequestSpacePicker={() => setShowSpacePicker(true)}
              onClearSpace={() => {
                setSelectedSpaceId(null);
                setSelectedSpaceName(null);
              }}
            />
          )}
          {candidate.kind === 'note' && !meta.noteCardType && (
            <GeneralNoteActionZone
              candidate={candidate}
              meta={meta}
              selectedAction={noteAction}
              onSelectAction={(action) => {
                setNoteAction(action);
                if (action === 'maketodo') {
                  onConvertToTodo?.();
                }
              }}
              selectedResurfaceTiming={resurfaceTiming}
              onSelectResurfaceTiming={setResurfaceTiming}
              confirmedResurfaceDate={
                confirmedResurfaceDate ? format(confirmedResurfaceDate, 'MMM d') : null
              }
              onRequestResurfaceDatePicker={() => {
                setDatePickerMode('resurface');
                setShowDatePicker(true);
              }}
              selectedSpaceId={selectedSpaceId}
              selectedSpaceName={selectedSpaceName}
              onRequestSpacePicker={() => setShowSpacePicker(true)}
              onClearSpace={() => {
                setSelectedSpaceId(null);
                setSelectedSpaceName(null);
              }}
            />
          )}
        </SweepCardShell>

        <SweepConversionToast
          visible={conversionMessage !== null}
          message={conversionMessage || ''}
          onDismissed={() => setConversionMessage(null)}
        />
      </View>

      {/* WrongTypePicker rendered OUTSIDE the card container so it layers on top */}
      {showWrongTypePicker && (
        <View style={styles.wrongTypePickerOverlay} pointerEvents="box-none">
          <WrongTypePicker
            visible={showWrongTypePicker}
            currentType={candidate.kind}
            onSelect={(newType) => {
              setShowWrongTypePicker(false);
              onConvertToType?.(newType);
            }}
            onClose={() => setShowWrongTypePicker(false)}
          />
        </View>
      )}

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
                {datePickerMode === 'remind'
                  ? 'Reminder date'
                  : datePickerMode === 'resurface'
                    ? 'Resurface date'
                    : datePickerMode === 'eventremind'
                      ? 'Reminder date'
                      : datePickerMode === 'eventdate'
                        ? 'Event date'
                        : 'Set due date'}
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

      {/* Space picker modal */}
      <Modal visible={showSpacePicker} transparent animationType="fade">
        <Pressable style={styles.dateModalBackdrop} onPress={() => setShowSpacePicker(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.dateModalContent, { maxHeight: 400 }]}
          >
            <Text style={styles.dateModalTitle}>Add to space</Text>
            <FlatList
              data={spaces}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setSelectedSpaceId(item.id);
                    setSelectedSpaceName(item.name);
                    setShowSpacePicker(false);
                  }}
                  style={({ pressed }) => [
                    styles.spacePickerRow,
                    pressed && { opacity: 0.7 },
                    selectedSpaceId === item.id && styles.spacePickerRowSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.spacePickerText,
                      selectedSpaceId === item.id && styles.spacePickerTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.spacePickerEmpty}>No spaces yet</Text>}
            />
            <Pressable
              style={styles.dateModalCancelButton}
              onPress={() => setShowSpacePicker(false)}
            >
              <Text style={styles.dateModalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getTypeConfig(candidate: SweepCandidate, meta?: SweepCardMeta) {
  switch (candidate.kind) {
    case 'todo':
      return {
        whisper: 'TODO',
        icon: <CheckSquare size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />,
        badge: undefined,
      };
    case 'note': {
      let whisper = 'NOTE';
      let icon: React.ReactNode = (
        <FileText size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />
      );
      if (meta?.noteCardType === 'idea') {
        whisper = 'IDEA';
        icon = <Lightbulb size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />;
      } else if (meta?.noteCardType === 'event') {
        whisper = 'EVENT';
        icon = <CalendarCheck size={11} strokeWidth={2.5} color="rgba(46,85,64,0.55)" />;
      }
      const badge = meta?.resurfacedFromDate
        ? {
            text: `Resurfaced from ${meta.resurfacedFromDate}`,
            color: '#5B6494',
            backgroundColor: 'rgba(156,166,224,0.1)',
            borderColor: 'rgba(156,166,224,0.2)',
            icon: <RotateCcw size={9} strokeWidth={2.5} color="#5B6494" />,
          }
        : undefined;
      return { whisper, icon, badge };
    }
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
  wrongTypePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
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
  spacePickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BRAND.radius.sm,
    marginBottom: 4,
  },
  spacePickerRowSelected: {
    backgroundColor: 'rgba(46,85,64,0.08)',
  },
  spacePickerText: {
    fontSize: 16,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  spacePickerTextSelected: {
    color: BRAND.colors.mossGreen,
    fontWeight: '600',
  },
  spacePickerEmpty: {
    fontSize: 14,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
