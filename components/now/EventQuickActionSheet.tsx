/**
 * EventQuickActionSheet
 *
 * Slide-up action sheet for calendar event quick actions.
 * Provides inline editing for time, prep notes, reminders,
 * plus dismiss and link-todo callbacks.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, StickyNote, Link2, Bell, EyeOff } from 'lucide-react-native';
import type { Note } from '../../lib/types';
import type { CalendarEvent } from '../../lib/calendar/CalendarClient';
import { EventTimePicker } from '../../app/components/morning-brief/components/EventTimePicker';

/* ─── unified event type ─── */

export interface UnifiedEvent {
  id: string;
  title: string;
  eventTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  isAllDay: boolean;
  sourceType: 'note' | 'calendar';
  /** Original Note object (only for sourceType 'note') */
  note?: Note;
  /** Original CalendarEvent (only for sourceType 'calendar') */
  calendarEvent?: CalendarEvent;
}

/* ─── constants ─── */

const SAGE = '#6A7D76';
const SAGE_TINT = '#F0F4F3';
const MOSS = '#2E5540';
const CHARCOAL = '#222222';
const MUTED = '#888888';
const DIVIDER = '#F0EDE8';
const DANGER_MUTED = '#9E3B3B';
const HANDLE_COLOR = '#D5D2CC';
const PRESSED_BG = '#F9F6F1';

const REMIND_OPTIONS: { label: string; minutes: number }[] = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: 'Day before', minutes: 1440 },
];

/* ─── helpers ─── */

/** Convert "HH:mm" → "8:00 AM" */
function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Convert "HH:mm" to an ISO string on today's date */
function hhmmToISO(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/* ─── types ─── */

export interface EventQuickActionSheetProps {
  visible: boolean;
  event: Note | null;
  unifiedEvent?: UnifiedEvent | null;
  onClose: () => void;
  onDismiss: (eventId: string) => void;
  onEditTime: (eventId: string, startTime: string, endTime: string | null) => void;
  onAddPrepNote: (eventId: string, note: string) => void;
  onLinkTodo: (eventId: string) => void;
  onRemind: (eventId: string, minutesBefore: number) => void;
  onOpenFull: (eventId: string) => void;
}

type ExpandedRow = 'editTime' | 'prepNote' | 'remind' | null;

/* ─── component ─── */

export default function EventQuickActionSheet({
  visible,
  event,
  unifiedEvent,
  onClose,
  onDismiss,
  onEditTime,
  onAddPrepNote,
  onLinkTodo,
  onRemind,
  onOpenFull,
}: EventQuickActionSheetProps) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<ExpandedRow>(null);
  const [prepText, setPrepText] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Derive a display object from whichever source is available
  const displayEvent = useMemo(() => {
    if (unifiedEvent) return unifiedEvent;
    if (event)
      return {
        id: event.id,
        title: event.title || 'Untitled',
        eventTime: event.event_time ?? null,
        endTime: event.end_time ?? null,
        isAllDay: !!event.is_all_day,
        sourceType: 'note' as const,
        note: event,
      };
    return null;
  }, [unifiedEvent, event]);

  const timeLabel = useMemo(() => {
    if (!displayEvent) return '';
    if (displayEvent.isAllDay) return 'All day';
    if (!displayEvent.eventTime) return '';
    const start = formatTime12(displayEvent.eventTime);
    if (displayEvent.endTime) {
      const end = formatTime12(displayEvent.endTime);
      return `${start} – ${end}`;
    }
    return start;
  }, [displayEvent]);

  const collapse = useCallback(() => {
    setExpanded(null);
    setPrepText('');
  }, []);

  const handleClose = useCallback(() => {
    collapse();
    setShowTimePicker(false);
    onClose();
  }, [collapse, onClose]);

  /* row handlers */

  const handleEditTimePress = useCallback(() => {
    if (expanded === 'editTime') {
      collapse();
      return;
    }
    collapse();
    setShowTimePicker(true);
    setExpanded('editTime');
  }, [expanded, collapse]);

  const handleTimePickerSave = useCallback(
    (_eventId: string, startISO: string, endISO: string) => {
      if (!displayEvent) return;
      // Extract HH:mm from the ISO strings
      const startDate = new Date(startISO);
      const endDate = new Date(endISO);
      const fmt = (d: Date) =>
        `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      onEditTime(displayEvent.id, fmt(startDate), fmt(endDate));
      setShowTimePicker(false);
      setExpanded(null);
    },
    [displayEvent, onEditTime],
  );

  const handleTimePickerClose = useCallback(() => {
    setShowTimePicker(false);
    setExpanded(null);
  }, []);

  const handlePrepNotePress = useCallback(() => {
    if (expanded === 'prepNote') {
      collapse();
      return;
    }
    collapse();
    setExpanded('prepNote');
    setPrepText(displayEvent?.note?.body ?? '');
  }, [expanded, collapse, displayEvent]);

  const handleSavePrepNote = useCallback(() => {
    if (!displayEvent || !prepText.trim()) return;
    onAddPrepNote(displayEvent.id, prepText.trim());
    collapse();
  }, [displayEvent, prepText, onAddPrepNote, collapse]);

  const handleRemindPress = useCallback(() => {
    if (expanded === 'remind') {
      collapse();
      return;
    }
    collapse();
    setExpanded('remind');
  }, [expanded, collapse]);

  const handleRemindChip = useCallback(
    (minutes: number) => {
      if (!displayEvent) return;
      onRemind(displayEvent.id, minutes);
      collapse();
    },
    [displayEvent, onRemind, collapse],
  );

  const handleLinkTodo = useCallback(() => {
    if (!displayEvent) return;
    onLinkTodo(displayEvent.id);
  }, [displayEvent, onLinkTodo]);

  const handleDismiss = useCallback(() => {
    if (!displayEvent) return;
    onDismiss(displayEvent.id);
    handleClose();
  }, [displayEvent, onDismiss, handleClose]);

  const handleOpenFull = useCallback(() => {
    if (!displayEvent) return;
    onOpenFull(displayEvent.id);
    handleClose();
  }, [displayEvent, onOpenFull, handleClose]);

  if (!displayEvent) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* dim overlay */}
        <Pressable style={styles.overlay} onPress={handleClose} />

        {/* card */}
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* event header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {displayEvent.title}
            </Text>
            <Text style={styles.headerSubtitle}>{timeLabel}</Text>
          </View>
          <View style={styles.headerDivider} />

          {/* ── Dismiss (always shown) ── */}
          <ActionRow
            icon={<EyeOff size={18} color={DANGER_MUTED} />}
            label="Hide from today"
            labelColor={DANGER_MUTED}
            onPress={handleDismiss}
          />
          <View style={styles.rowDivider} />

          {/* ── Remind Me (shown when event has a time) ── */}
          {displayEvent.eventTime && (
            <>
              <ActionRow
                icon={<Bell size={18} color={SAGE} />}
                label="Remind me"
                onPress={handleRemindPress}
              />
              {expanded === 'remind' && (
                <View style={styles.chipRow}>
                  {REMIND_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.minutes}
                      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                      onPress={() => handleRemindChip(opt.minutes)}
                    >
                      <Text style={styles.chipText}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.rowDivider} />
            </>
          )}

          {/* ── Edit Time ── */}
          <ActionRow
            icon={<Clock size={18} color={SAGE} />}
            label="Edit time"
            rightDetail={timeLabel}
            onPress={handleEditTimePress}
          />
          {expanded === 'editTime' && (
            <EventTimePicker
              visible={showTimePicker}
              eventId={displayEvent.id}
              eventTitle={displayEvent.title}
              originalStartAt={hhmmToISO(displayEvent.eventTime)}
              originalEndAt={hhmmToISO(displayEvent.endTime)}
              currentOverride={null}
              onClose={handleTimePickerClose}
              onSave={handleTimePickerSave}
              onReset={() => {}}
            />
          )}
          <View style={styles.rowDivider} />

          {/* ── Add Prep Note ── */}
          <ActionRow
            icon={<StickyNote size={18} color={SAGE} />}
            label="Add prep note"
            rightDetail={displayEvent.note?.body ? 'Edit' : undefined}
            onPress={handlePrepNotePress}
          />
          {expanded === 'prepNote' && (
            <View style={styles.inlineExpand}>
              <TextInput
                style={styles.prepInput}
                placeholder="e.g. Bring Q4 deck"
                placeholderTextColor={MUTED}
                maxLength={200}
                autoFocus
                value={prepText}
                onChangeText={setPrepText}
                returnKeyType="done"
                onSubmitEditing={handleSavePrepNote}
              />
              <Pressable
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}
                onPress={handleSavePrepNote}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.rowDivider} />

          {/* ── Link a Todo ── */}
          <ActionRow
            icon={<Link2 size={18} color={SAGE} />}
            label="Link a todo"
            onPress={handleLinkTodo}
          />
          <View style={styles.rowDivider} />

          {/* ── Footer: open full details ── */}
          <Pressable
            style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.7 }]}
            onPress={handleOpenFull}
          >
            <Text style={styles.footerBtnText}>Open full details</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* EventTimePicker renders its own modal — kept outside the card flow */}
    </Modal>
  );
}

/* ─── ActionRow sub-component ─── */

function ActionRow({
  icon,
  label,
  rightDetail,
  labelColor,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  rightDetail?: string;
  labelColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: PRESSED_BG }]}
      onPress={onPress}
    >
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={[styles.actionLabel, labelColor ? { color: labelColor } : undefined]}>
        {label}
      </Text>
      {rightDetail ? <Text style={styles.actionDetail}>{rightDetail}</Text> : null}
    </Pressable>
  );
}

/* ─── styles ─── */

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  /* handle */
  handleRow: {
    alignItems: 'center',
    marginTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HANDLE_COLOR,
  },

  /* header */
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: CHARCOAL,
  },
  headerSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: DIVIDER,
  },

  /* action rows */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIcon: {
    marginRight: 14,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: CHARCOAL,
    flex: 1,
  },
  actionDetail: {
    fontSize: 12,
    color: MUTED,
  },
  rowDivider: {
    height: 1,
    backgroundColor: DIVIDER,
    marginLeft: 50,
  },

  /* inline expand — prep note */
  inlineExpand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  prepInput: {
    flex: 1,
    fontSize: 14,
    color: CHARCOAL,
    backgroundColor: SAGE_TINT,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtn: {
    backgroundColor: MOSS,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* remind chips */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    backgroundColor: SAGE_TINT,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: CHARCOAL,
  },

  /* footer */
  footerBtn: {
    backgroundColor: SAGE_TINT,
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: MOSS,
  },
});
