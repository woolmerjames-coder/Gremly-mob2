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
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
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
import type { SpaceMilestone, Note } from '../../lib/types';
import type { ImageSourcePropType } from 'react-native';
import { getMascotSource, DEFAULT_MASCOT_ID } from '../../lib/mascots/mascotConfig';

interface MilestoneHeaderProps {
  spaceName: string;
  milestone: SpaceMilestone | null;
  countdown: {
    days: number | null;
    dateFormatted: string | null;
    isPast: boolean;
  };
  pinnedCount: number;
  completedCount?: number;
  mascotSource?: ImageSourcePropType; // Custom mascot image source
  goalEvent?: Note | null; // Goal event note (new system)
  keyDatesCount?: number; // Number of key date events (excluding goals)
  nextKeyDatePreview?: string | null; // Preview text for next key date
  children?: ReactNode; // Optional content to render in header (e.g., KeyDatesSection)
  onGremlyPress: () => void;
  onPinnedPress: () => void;
  onCompletedPress?: () => void;
  onNudgePress: () => void;
  onMilestonePress: () => void;
  onKeyDatesPress?: () => void; // Open Key Dates modal
  onSettingsPress: () => void;
  onBackPress: () => void;
}

export function MilestoneHeader({
  spaceName,
  milestone,
  countdown,
  pinnedCount,
  completedCount = 0,
  mascotSource,
  goalEvent = null,
  keyDatesCount = 0,
  nextKeyDatePreview = null,
  children,
  onGremlyPress,
  onPinnedPress,
  onCompletedPress,
  onNudgePress,
  onMilestonePress,
  onKeyDatesPress,
  onSettingsPress,
  onBackPress,
}: MilestoneHeaderProps) {
  const insets = useSafeAreaInsets();
  // Show nudge only if no milestone AND no goal event
  const hasMilestone = milestone !== null;
  const hasGoalEvent = goalEvent !== null;
  const showNudge = !hasMilestone && !hasGoalEvent;

  // Show Key Dates row if there are events or if there's a handler to add them
  const showKeyDates = keyDatesCount > 0 || onKeyDatesPress;

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
          <Image
            source={mascotSource || getMascotSource(DEFAULT_MASCOT_ID)}
            style={styles.gremlyImage}
            resizeMode="contain"
          />
        </Pressable>

        {/* Milestone or Nudge */}
        <View style={styles.milestoneSection}>
          {hasMilestone ? (
            // Milestone display - tappable to edit
            <Pressable
              onPress={onMilestonePress}
              accessibilityRole="button"
              accessibilityLabel="Edit goal"
              testID="header-milestone-button"
            >
              <Text style={styles.milestoneName} numberOfLines={2}>
                {milestone.name}
              </Text>
              {countdown.dateFormatted && (
                <Text style={styles.countdown}>
                  {countdown.dateFormatted}
                  {countdown.days !== null && (
                    <Text style={countdown.isPast ? styles.countdownPast : styles.countdownDays}>
                      {' · '}
                      {countdown.isPast
                        ? `${Math.abs(countdown.days)} days ago`
                        : countdown.days === 0
                          ? 'Today!'
                          : countdown.days === 1
                            ? '1 day'
                            : `${countdown.days} days`}
                    </Text>
                  )}
                </Text>
              )}
            </Pressable>
          ) : hasGoalEvent ? (
            // Goal event display (no countdown - simpler)
            <Pressable
              onPress={onMilestonePress}
              accessibilityRole="button"
              accessibilityLabel="Edit goal"
              testID="header-goal-button"
            >
              <Text style={styles.milestoneName} numberOfLines={2}>
                {goalEvent?.title || 'Goal'}
              </Text>
            </Pressable>
          ) : showNudge ? (
            // Nudge to set a goal
            <Pressable
              onPress={onNudgePress}
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
    marginRight: 16,
  },
  gremlyImage: {
    width: 100,
    height: 100,
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
  milestoneName: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 0,
  },
  countdown: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
  },
  countdownDays: {
    color: BRAND.colors.mossGreen,
    fontWeight: '500',
  },
  countdownPast: {
    color: '#C9553D', // Red-ish for overdue
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
