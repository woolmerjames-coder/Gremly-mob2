/**
 * StepPrioritize - Step 3 of the Morning Brief flow
 *
 * Shows when flexible tasks exceed available capacity.
 * User selects priorities via OnYourPlateSection checkboxes
 * and can assign tasks to blocks via TaskQuickActionSheet.
 */

import React from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { OnYourPlateSection, type TaskItemData } from './components';
import { CapacityRing } from './components/CapacityRing';
import { Plus } from 'lucide-react-native';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function formatMins(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface StepPrioritizeProps {
  // Task data
  flexibleTasks: TaskItemData[];

  // Mode flag — controls messaging, not visibility
  isPrioritizing: boolean;

  // Capacity data
  selectedMinutes: number;
  totalAvailableMinutes: number;
  remainingMinutes: number;
  isOverCommitted: boolean;

  // Selection state
  selectedIds: Set<string>;
  lockedIds: Set<string>;

  // Handlers
  onToggleSelect: (task: TaskItemData) => void;
  onToggleLock: (task: TaskItemData) => void;
  onTaskPress: (task: TaskItemData) => void;
  onTimePress: (task: TaskItemData) => void;
  onAddPress: () => void;
  onAssignPress: (task: TaskItemData) => void;

  // Pending drops for animation
  pendingDrops: any[];
  animatingAssignments: any[] | null;

  // Navigation
  onContinue: () => void;
  onSkip: () => void;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function StepPrioritize({
  flexibleTasks,
  isPrioritizing,
  selectedMinutes,
  totalAvailableMinutes,
  remainingMinutes,
  animatingAssignments,
  pendingDrops,
  selectedIds,
  lockedIds,
  onToggleSelect,
  onToggleLock,
  onTaskPress,
  onTimePress,
  onAddPress,
  onAssignPress,
  onContinue,
  onSkip,
}: StepPrioritizeProps) {
  const hasTasks = flexibleTasks.length > 0;
  const isFullyBooked = totalAvailableMinutes <= 0 && hasTasks;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step header — messaging depends on capacity */}
        <View style={styles.headerArea}>
          {!hasTasks ? (
            <>
              <Text style={styles.title}>Nothing on the list yet</Text>
              <Text style={styles.subtitle}>Drop something in Mind Drop or tap + to add</Text>
            </>
          ) : isFullyBooked ? (
            <>
              <Text style={styles.title}>Your day is fully booked</Text>
              <Text style={styles.subtitle}>Pick what still needs to happen</Text>
            </>
          ) : isPrioritizing ? (
            <>
              <Text style={styles.title}>What matters most today?</Text>
              <Text style={styles.subtitle}>Pick your priorities for today</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Here's what's on your plate</Text>
              <Text style={styles.subtitle}>Select what you want to tackle today</Text>
            </>
          )}
        </View>

        {/* Capacity bar — when prioritizing or fully booked */}
        {(isPrioritizing || isFullyBooked) && (
          <View style={styles.capacityBar}>
            <CapacityRing
              percentage={
                isFullyBooked
                  ? 100
                  : totalAvailableMinutes > 0
                    ? Math.round((selectedMinutes / totalAvailableMinutes) * 100)
                    : 0
              }
              size={44}
              strokeWidth={3.5}
            />
            <View style={styles.capacityText}>
              <Text
                style={[
                  styles.capacityHeadline,
                  (remainingMinutes < 0 || isFullyBooked) && styles.capacityHeadlineOver,
                ]}
              >
                {isFullyBooked
                  ? 'No free time today'
                  : `${formatMins(selectedMinutes)} of ${formatMins(totalAvailableMinutes)} planned`}
              </Text>
              <Text
                style={[
                  styles.capacitySubline,
                  (remainingMinutes < 0 || isFullyBooked) && styles.capacitySublineOver,
                ]}
              >
                {isFullyBooked
                  ? 'Fully booked'
                  : remainingMinutes >= 0
                    ? `${formatMins(remainingMinutes)} still free`
                    : `${formatMins(Math.abs(remainingMinutes))} over`}
              </Text>
            </View>
          </View>
        )}

        {/* Zero tasks empty state */}
        {!hasTasks && (
          <View style={styles.emptyTaskState}>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
              onPress={onAddPress}
            >
              <Plus size={20} color={BRAND.colors.mossGreen} />
              <Text style={styles.addButtonText}>Add a task</Text>
            </Pressable>
          </View>
        )}

        {/* Task selection list */}
        {hasTasks && (
          <OnYourPlateSection
            tasks={flexibleTasks}
            animatingAssignments={animatingAssignments}
            onTaskPress={onTaskPress}
            onTimePress={onTimePress}
            onAddPress={onAddPress}
            pendingDrops={pendingDrops}
            isPrioritizing={true}
            showAll
            selectedIds={selectedIds}
            lockedIds={lockedIds}
            onToggleSelect={onToggleSelect}
            onToggleLock={onToggleLock}
            onAssignPress={onAssignPress}
            maxLocks={3}
          />
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.continueButton, pressed && { opacity: 0.7 }]}
          onPress={onContinue}
        >
          <Text style={styles.continueText}>Continue →</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.skipPressable, pressed && { opacity: 0.5 }]}
          onPress={onSkip}
        >
          <Text style={styles.skipText}>Skip · keep all</Text>
        </Pressable>
      </View>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  headerArea: {
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
  capacityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#E8F0EB',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  capacityText: {
    flex: 1,
  },
  capacityHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  capacityHeadlineOver: {
    color: '#C45B4A',
  },
  capacitySubline: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 1,
  },
  capacitySublineOver: {
    color: '#C45B4A',
  },
  emptyTaskState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F0EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  continueButton: {
    backgroundColor: '#E8F0EB',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  continueText: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  skipPressable: {
    alignItems: 'center',
  },
  skipText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    paddingVertical: 12,
  },
});

export default StepPrioritize;
