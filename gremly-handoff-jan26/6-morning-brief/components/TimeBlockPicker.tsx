/**
 * TimeBlockPicker
 *
 * Modal picker for assigning tasks to time blocks.
 * Includes lock-in toggle option.
 * Uses Lucide icons to match CalendarScreen patterns.
 */

import React, { useState, useRef, useMemo } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Switch } from 'react-native';
import { Sunrise, Sun, Sunset, ArrowLeftRight, Diamond, Check, EyeOff } from 'lucide-react-native';
import { getTimeBlockBoundaries, type TimeBlock } from '../../../../lib/capacity';
import { useGremlyStore } from '../../../../lib/store/useGremlyStore';
import type { TaskItemData } from './TaskItem';

// Colors matching CalendarScreen exactly
const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
  selectedBg: 'rgba(46, 85, 64, 0.1)', // mossGreen at 10%
};

// Helper to format hour to 12h string
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

const FLEXIBLE_OPTION = {
  key: 'any' as const,
  label: 'Keep flexible',
  color: '#999999',
  Icon: ArrowLeftRight,
};

interface TimeBlockPickerProps {
  visible: boolean;
  task: TaskItemData | null;
  onClose: () => void;
  onAssign: (
    taskId: string,
    taskType: 'todo' | 'habit',
    timeWindow: TimeBlock | 'any',
    lockIn: boolean,
  ) => void;
}

export function TimeBlockPicker({ visible, task, onClose, onAssign }: TimeBlockPickerProps) {
  // Get time block preferences and hide action from store
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const hideForToday = useGremlyStore((s) => s.hideForToday);

  // Build time block options dynamically from preferences
  const timeBlockOptions = useMemo(() => {
    const boundaries = getTimeBlockBoundaries(timeBlockPreferences);
    return [
      {
        key: 'morning' as TimeBlock,
        label: 'Morning',
        timeRange: `${formatHour(boundaries.morning.startHour)} – ${formatHour(boundaries.morning.endHour)}`,
        color: '#D4A574',
        Icon: Sunrise,
      },
      {
        key: 'day' as TimeBlock,
        label: 'Afternoon',
        timeRange: `${formatHour(boundaries.day.startHour)} – ${formatHour(boundaries.day.endHour)}`,
        color: '#C9956C',
        Icon: Sun,
      },
      {
        key: 'evening' as TimeBlock,
        label: 'Evening',
        timeRange: `${formatHour(boundaries.evening.startHour)} – ${formatHour(boundaries.evening.endHour)}`,
        color: '#A89BC9',
        Icon: Sunset,
      },
    ];
  }, [timeBlockPreferences]);

  // Derive lockIn state from task, use local toggle for user changes
  const [lockInOverride, setLockInOverride] = useState<boolean | null>(null);
  const lockIn = lockInOverride ?? task?.isLockedIn ?? false;

  // Reset override when task changes - using useRef to avoid render-phase setState
  const prevTaskIdRef = useRef<string | null>(null);
  if (task?.id !== prevTaskIdRef.current) {
    prevTaskIdRef.current = task?.id ?? null;
    // Only reset if we have a new task (not on unmount)
    if (task?.id && lockInOverride !== null) {
      setLockInOverride(null);
    }
  }

  const setLockIn = (value: boolean) => setLockInOverride(value);

  if (!task) return null;

  // Determine current selection
  const currentTimeWindow = task.timeWindow;
  const isFlexible = !currentTimeWindow || currentTimeWindow === 'any';

  const handleSelect = (key: TimeBlock | 'any') => {
    onAssign(task.id, task.type, key, lockIn);
    onClose();
  };

  const handleNotToday = () => {
    hideForToday(task.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Assign to time block</Text>

          {/* Time Block Options */}
          {timeBlockOptions.map((option) => {
            const isSelected = currentTimeWindow === option.key;
            const { Icon } = option;

            return (
              <Pressable
                key={option.key}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => handleSelect(option.key)}
              >
                <Icon size={20} color={option.color} style={styles.optionIcon} />
                <View style={styles.optionLabelContainer}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionTimeRange}>{option.timeRange}</Text>
                </View>
                {isSelected && <Check size={20} color={COLORS.mossGreen} />}
              </Pressable>
            );
          })}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Keep Flexible Option */}
          <Pressable
            style={[styles.option, isFlexible && styles.optionSelected]}
            onPress={() => handleSelect('any')}
          >
            <FLEXIBLE_OPTION.Icon
              size={20}
              color={FLEXIBLE_OPTION.color}
              style={styles.optionIcon}
            />
            <Text style={styles.optionLabel}>{FLEXIBLE_OPTION.label}</Text>
            {isFlexible && <Check size={20} color={COLORS.mossGreen} />}
          </Pressable>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Lock-in Toggle */}
          <View style={styles.lockInRow}>
            <Diamond size={20} color={COLORS.mossGreen} style={styles.optionIcon} />
            <Text style={styles.optionLabel}>Lock this in</Text>
            <Switch
              value={lockIn}
              onValueChange={setLockIn}
              trackColor={{ false: COLORS.divider, true: COLORS.mossGreen }}
              thumbColor={COLORS.surface}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Not Today Option */}
          <Pressable style={styles.option} onPress={handleNotToday}>
            <EyeOff size={20} color={COLORS.inkMuted} style={styles.optionIcon} />
            <View style={styles.optionLabelContainer}>
              <Text style={styles.optionLabel}>Not today</Text>
              <Text style={styles.optionTimeRange}>Hide from Morning Brief until tomorrow</Text>
            </View>
          </Pressable>

          {/* Cancel Button */}
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
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
    padding: 32,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginVertical: 2,
  },
  optionSelected: {
    backgroundColor: COLORS.selectedBg,
  },
  optionIcon: {
    marginRight: 12,
  },
  optionLabelContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    color: COLORS.charcoalInk,
  },
  optionTimeRange: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.divider,
    marginVertical: 8,
  },
  lockInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
});
