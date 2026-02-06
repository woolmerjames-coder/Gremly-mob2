/**
 * EventTimePicker
 *
 * Picker for overriding calendar event start/end times locally.
 * User can edit start time, end time, or duration — all stay in sync.
 * Does NOT sync back to calendar - only affects Gremly's capacity calculation.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Clock, Check, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react-native';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
};

// Duration presets in minutes
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

interface EventTimePickerProps {
  visible: boolean;
  eventId: string | null;
  eventTitle: string | null;
  originalStartAt: string | null; // ISO timestamp
  originalEndAt: string | null; // ISO timestamp
  currentOverride: { startAt: string; endAt: string } | null;
  onClose: () => void;
  onSave: (eventId: string, startAt: string, endAt: string) => void;
  onReset: (eventId: string) => void;
}

// Helper to format time for display (e.g., "1:30 PM")
function formatTimeDisplay(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Helper to format duration
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// Helper to calculate duration in minutes
function getDurationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

// Helper to add minutes to a date
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

// Time adjuster component
function TimeAdjuster({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (newValue: Date) => void;
}) {
  const adjustTime = (deltaMinutes: number) => {
    onChange(addMinutes(value, deltaMinutes));
  };

  return (
    <View style={adjusterStyles.container}>
      <Text style={adjusterStyles.label}>{label}</Text>
      <View style={adjusterStyles.controls}>
        <Pressable
          style={adjusterStyles.button}
          onPress={() => adjustTime(-15)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronDown size={20} color={COLORS.mossGreen} />
        </Pressable>
        <Text style={adjusterStyles.value}>{formatTimeDisplay(value)}</Text>
        <Pressable
          style={adjusterStyles.button}
          onPress={() => adjustTime(15)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronUp size={20} color={COLORS.mossGreen} />
        </Pressable>
      </View>
    </View>
  );
}

const adjusterStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    minWidth: 140,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    padding: 10,
    backgroundColor: COLORS.linenCream,
    borderRadius: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    marginHorizontal: 8,
    minWidth: 80,
    textAlign: 'center',
  },
});

export function EventTimePicker({
  visible,
  eventId,
  eventTitle,
  originalStartAt,
  originalEndAt,
  currentOverride,
  onClose,
  onSave,
  onReset,
}: EventTimePickerProps) {
  // Don't render content when not visible - this causes remount on open
  if (!visible || !eventId || !originalStartAt || !originalEndAt) {
    return null;
  }

  return (
    <EventTimePickerContent
      eventId={eventId}
      eventTitle={eventTitle}
      originalStartAt={originalStartAt}
      originalEndAt={originalEndAt}
      currentOverride={currentOverride}
      onClose={onClose}
      onSave={onSave}
      onReset={onReset}
    />
  );
}

// Inner component that remounts when picker opens
function EventTimePickerContent({
  eventId,
  eventTitle,
  originalStartAt,
  originalEndAt,
  currentOverride,
  onClose,
  onSave,
  onReset,
}: Omit<EventTimePickerProps, 'visible'> & {
  eventId: string;
  originalStartAt: string;
  originalEndAt: string;
}) {
  // Initialize state from props - this works because component remounts
  const initialStart = currentOverride
    ? new Date(currentOverride.startAt)
    : new Date(originalStartAt);
  const initialEnd = currentOverride ? new Date(currentOverride.endAt) : new Date(originalEndAt);

  // Working state for the picker
  const [startTime, setStartTime] = useState<Date>(initialStart);
  const [endTime, setEndTime] = useState<Date>(initialEnd);

  // Calculate values
  const hasOverride = currentOverride !== null;
  const duration = getDurationMinutes(startTime, endTime);
  const originalStart = new Date(originalStartAt);
  const originalEnd = new Date(originalEndAt);
  const originalDuration = getDurationMinutes(originalStart, originalEnd);

  // Handle start time change - keep duration constant
  const handleStartChange = useCallback(
    (newStart: Date) => {
      const currentDuration = getDurationMinutes(startTime, endTime);
      setStartTime(newStart);
      setEndTime(addMinutes(newStart, currentDuration));
    },
    [startTime, endTime],
  );

  // Handle end time change - adjust duration
  const handleEndChange = useCallback(
    (newEnd: Date) => {
      // Ensure end is after start (minimum 15 min)
      const minEnd = addMinutes(startTime, 15);
      if (newEnd < minEnd) {
        setEndTime(minEnd);
      } else {
        setEndTime(newEnd);
      }
    },
    [startTime],
  );

  // Handle duration preset tap - keep start, adjust end
  const handleDurationPreset = useCallback(
    (minutes: number) => {
      setEndTime(addMinutes(startTime, minutes));
    },
    [startTime],
  );

  // Save handler
  const handleSave = () => {
    onSave(eventId, startTime.toISOString(), endTime.toISOString());
    onClose();
  };

  // Reset handler
  const handleReset = () => {
    onReset(eventId);
    onClose();
  };

  // Check if current values differ from original
  const hasChanges =
    startTime.getTime() !== originalStart.getTime() || endTime.getTime() !== originalEnd.getTime();

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Clock size={20} color={COLORS.mossGreen} />
              <Text style={styles.title}>Edit event time</Text>
            </View>

            {/* Event name */}
            <Text style={styles.eventName} numberOfLines={2}>
              {eventTitle}
            </Text>

            {/* Original time reference */}
            <Text style={styles.originalNote}>
              Calendar: {formatTimeDisplay(originalStart)} – {formatTimeDisplay(originalEnd)} (
              {formatDuration(originalDuration)})
            </Text>

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>
                This only affects times in Gremly — it doesn't sync with your external calendar.
              </Text>
            </View>

            {/* Time Adjusters */}
            <View style={styles.adjustersRow}>
              <TimeAdjuster label="Start" value={startTime} onChange={handleStartChange} />
              <View style={styles.adjusterDivider} />
              <TimeAdjuster label="End" value={endTime} onChange={handleEndChange} />
            </View>

            {/* Current Duration Display */}
            <View style={styles.durationDisplay}>
              <Text style={styles.durationLabel}>Duration:</Text>
              <Text style={styles.durationValue}>{formatDuration(duration)}</Text>
            </View>

            {/* Duration Presets */}
            <Text style={styles.presetsLabel}>Quick duration</Text>
            <View style={styles.presetsGrid}>
              {DURATION_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  style={[styles.presetButton, duration === preset && styles.presetButtonSelected]}
                  onPress={() => handleDurationPreset(preset)}
                >
                  <Text
                    style={[styles.presetText, duration === preset && styles.presetTextSelected]}
                  >
                    {formatDuration(preset)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              {hasOverride && (
                <Pressable style={styles.resetButton} onPress={handleReset}>
                  <RotateCcw size={16} color={COLORS.inkMuted} />
                  <Text style={styles.resetText}>Reset to original</Text>
                </Pressable>
              )}
              <View style={styles.actionsSpacer} />
              <Pressable
                style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!hasChanges}
              >
                <Check size={18} color={COLORS.surface} />
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>

            {/* Cancel */}
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    marginLeft: 8,
  },
  eventName: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
    textAlign: 'center',
    marginBottom: 4,
  },
  originalNote: {
    fontSize: 13,
    color: COLORS.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  disclaimer: {
    backgroundColor: COLORS.linenCream,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  adjustersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  adjusterDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.divider,
    marginHorizontal: 4,
  },
  durationDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.linenCream,
    borderRadius: 8,
  },
  durationLabel: {
    fontSize: 14,
    color: COLORS.inkMuted,
    marginRight: 8,
  },
  durationValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.mossGreen,
  },
  presetsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  presetButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.linenCream,
    minWidth: 50,
    alignItems: 'center',
  },
  presetButtonSelected: {
    backgroundColor: COLORS.mossGreen,
  },
  presetText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  presetTextSelected: {
    color: COLORS.surface,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resetText: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginLeft: 6,
  },
  actionsSpacer: {
    flex: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.mossGreen,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
    marginLeft: 6,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
});
