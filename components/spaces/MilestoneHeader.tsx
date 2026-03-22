/**
 * MilestoneHeader - Space Dashboard header with Gremly mascot and milestone
 *
 * Shows:
 * - Gremly mascot (tappable → chat)
 * - Goal title with star icon (if set)
 * - Key Dates summary row (tappable → modal)
 * - Pinned/Completed pills
 * - OR Nudge to set a goal (if no goal)
 */

import React, { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Flag,
  Pin,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Calendar,
} from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import type { Note } from '../../lib/types';
import MascotLottie from '../../app/components/MascotLottie';

interface MilestoneHeaderProps {
  spaceName: string;
  pinnedCount: number;
  completedCount?: number;
  goalEvent?: Note | null; // Featured goal (kept for backward compatibility)
  goals?: Note[]; // All goals for the space (up to 3)
  keyDatesCount?: number; // Number of key date events (excluding goals)
  nextKeyDatePreview?: string | null; // Preview text for next key date
  children?: ReactNode; // Optional content to render in header (e.g., KeyDatesSection)
  onGremlyPress: () => void;
  onPinnedPress: () => void;
  onCompletedPress?: () => void;
  onKeyDatesPress: () => void; // Open Key Dates modal (goal tap, nudge tap, key dates row)
  onSettingsPress: () => void;
  onBackPress: () => void;
}

export function MilestoneHeader({
  spaceName,
  pinnedCount,
  completedCount = 0,
  goalEvent = null,
  goals = [],
  keyDatesCount = 0,
  nextKeyDatePreview = null,
  children,
  onGremlyPress,
  onPinnedPress,
  onCompletedPress,
  onKeyDatesPress,
  onSettingsPress,
  onBackPress,
}: MilestoneHeaderProps) {
  const insets = useSafeAreaInsets();
  // Primary goal is first in goals array, or fallback to goalEvent for compatibility
  const primaryGoal = goals.length > 0 ? goals[0] : goalEvent;
  const additionalGoalsCount = Math.max(0, goals.length - 1);

  // Show nudge only if no goals
  const hasGoals = goals.length > 0 || goalEvent !== null;
  const showNudge = !hasGoals;

  // Always show Key Dates row
  const showKeyDates = true;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Top row: Back, Space Name, Settings */}
      <View style={styles.topRow}>
        <Pressable
          onPress={onBackPress}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="header-back-button"
        >
          <ChevronLeft size={28} color={BRAND.colors.inkMuted} />
        </Pressable>
        <View style={styles.titleContainer}>
          <Text style={styles.spaceName} numberOfLines={1}>
            {spaceName}
          </Text>
          <View style={styles.titleUnderline} />
        </View>
        <Pressable
          onPress={onSettingsPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Space settings"
          testID="header-settings-button"
        >
          <MoreHorizontal size={24} color={BRAND.colors.charcoalInk} />
        </Pressable>
      </View>

      {/* Main content: Gremly + Milestone/Nudge */}
      <View style={styles.mainContent}>
        {/* Gremly mascot */}
        <Pressable
          onPress={onGremlyPress}
          style={styles.gremlyContainer}
          accessibilityRole="button"
          accessibilityLabel="Chat with Gremly"
          testID="header-gremly-button"
        >
          <MascotLottie />
        </Pressable>

        {/* Goal or Nudge */}
        <View style={styles.milestoneSection}>
          {primaryGoal ? (
            // Goal display - tappable to open Key Dates modal
            <Pressable
              onPress={onKeyDatesPress}
              accessibilityRole="button"
              accessibilityLabel={
                additionalGoalsCount > 0
                  ? `${primaryGoal.title} and ${additionalGoalsCount} more goals`
                  : 'View goals and key dates'
              }
              testID="header-goal-button"
            >
              <View style={styles.goalTitleRow}>
                <Text style={styles.milestoneName} numberOfLines={2}>
                  {primaryGoal.title || 'Goal'}
                </Text>
                {additionalGoalsCount > 0 && (
                  <Text style={styles.moreGoalsText}>+{additionalGoalsCount} more</Text>
                )}
              </View>
            </Pressable>
          ) : showNudge ? (
            // Nudge to set a goal - opens Key Dates modal
            <Pressable
              onPress={onKeyDatesPress}
              style={styles.nudgeContainer}
              accessibilityRole="button"
              accessibilityLabel="Set a goal for this Space"
              testID="header-nudge-button"
            >
              <View style={styles.nudgeHeader}>
                <Flag size={16} color={BRAND.colors.mossGreen} />
                <Text style={styles.nudgeTitle}>Set a goal</Text>
              </View>
              <Text style={styles.nudgeSubtitle}>Goals help you get things done</Text>
            </Pressable>
          ) : null}

          {/* Key Dates row - tappable to open modal */}
          {showKeyDates && (
            <Pressable
              onPress={onKeyDatesPress}
              style={({ pressed }) => [styles.keyDatesRow, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Key Dates${keyDatesCount > 0 ? `, ${keyDatesCount} events` : ''}`}
              testID="header-key-dates-button"
            >
              <View style={styles.keyDatesLeft}>
                <Calendar size={14} color={BRAND.colors.inkMuted} />
                <Text style={styles.keyDatesText}>
                  Key Dates
                  {keyDatesCount > 0 && (
                    <Text style={styles.keyDatesCount}> ({keyDatesCount})</Text>
                  )}
                </Text>
              </View>
              {nextKeyDatePreview && (
                <Text style={styles.keyDatesPreview} numberOfLines={1}>
                  Next: {nextKeyDatePreview}
                </Text>
              )}
              <ChevronRight size={14} color={BRAND.colors.inkMuted} />
            </Pressable>
          )}

          {/* Action pills row - pinned and completed */}
          <View style={styles.pillsRow}>
            {/* Pinned pill */}
            {pinnedCount > 0 && (
              <Pressable
                onPress={onPinnedPress}
                style={({ pressed }) => [
                  styles.pinnedButton,
                  pressed && styles.actionButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${pinnedCount} pinned items`}
                testID="header-pinned-button"
              >
                <Pin size={14} color="#5B68A8" />
                <Text style={styles.pinnedButtonText}>{pinnedCount} pinned</Text>
              </Pressable>
            )}

            {/* Completed pill */}
            {completedCount > 0 && onCompletedPress && (
              <Pressable
                onPress={onCompletedPress}
                style={({ pressed }) => [
                  styles.completedButton,
                  pressed && styles.actionButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${completedCount} completed items`}
                testID="header-completed-button"
              >
                <CheckCircle2 size={14} color={BRAND.colors.mossGreen} />
                <Text style={styles.completedButtonText}>{completedCount} completed</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Optional children (e.g., KeyDatesSection) */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F5F1EB', // Slightly darker than linenCream for subtle header distinction
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },

  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  spaceName: {
    fontSize: 24,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
  titleUnderline: {
    width: 48,
    height: 3,
    backgroundColor: BRAND.colors.goldenPear,
    borderRadius: 2,
    marginTop: 4,
  },

  // Main content
  mainContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gremlyContainer: {
    marginRight: 12,
    width: 95,
    height: 111,
  },

  // Milestone section
  milestoneSection: {
    flex: 1,
    justifyContent: 'center',
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 0,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  milestoneName: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 0,
  },
  moreGoalsText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    fontWeight: '500',
  },

  // Nudge
  nudgeContainer: {
    paddingVertical: 8,
  },
  nudgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  nudgeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  nudgeSubtitle: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },

  // Key Dates row - plain metadata style, no chip background
  keyDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 2,
    gap: 4,
  },
  keyDatesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keyDatesText: {
    fontSize: 13,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  keyDatesCount: {
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
  },
  keyDatesPreview: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginLeft: 8,
    marginRight: 2,
  },

  // Action row (removed - pinned now inline)
  actionButtonPressed: {
    opacity: 0.7,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pinnedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(100, 115, 180, 0.2)', // darker periwinkle at 20%
  },
  pinnedButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5B68A8', // darker periwinkle for readability
  },
  completedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
  },
  completedButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
});

export default MilestoneHeader;
