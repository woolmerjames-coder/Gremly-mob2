/**
 * MilestoneHeader - Space Dashboard header with Gremly mascot and milestone
 *
 * Shows:
 * - Gremly mascot (tappable → chat)
 * - Milestone name + countdown (if set)
 * - OR Nudge to set a goal (if no milestone)
 * - Action buttons: [+ Add], [[PIN] X pinned]
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flag, Plus, Pin, Settings } from 'lucide-react-native';
import { BRAND } from '../../design/brand';
import type { SpaceMilestone } from '../../lib/types';

interface MilestoneHeaderProps {
  spaceName: string;
  milestone: SpaceMilestone | null;
  countdown: {
    days: number | null;
    dateFormatted: string | null;
    isPast: boolean;
  };
  pinnedCount: number;
  onGremlyPress: () => void;
  onAddPress: () => void;
  onPinnedPress: () => void;
  onNudgePress: () => void;
  onSettingsPress: () => void;
  onBackPress: () => void;
}

export function MilestoneHeader({
  spaceName,
  milestone,
  countdown,
  pinnedCount,
  onGremlyPress,
  onAddPress,
  onPinnedPress,
  onNudgePress,
  onSettingsPress,
  onBackPress,
}: MilestoneHeaderProps) {
  const insets = useSafeAreaInsets();
  const hasMilestone = milestone !== null;

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
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.spaceName} numberOfLines={1}>
          {spaceName}
        </Text>
        <Pressable
          onPress={onSettingsPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Space settings"
          testID="header-settings-button"
        >
          <Settings size={24} color={BRAND.colors.charcoalInk} />
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
            source={require('../../assets/mascot/astrogremly.png')}
            style={styles.gremlyImage}
            resizeMode="contain"
          />
        </Pressable>

        {/* Milestone or Nudge */}
        <View style={styles.milestoneSection}>
          {hasMilestone ? (
            // Milestone display
            <>
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
            </>
          ) : (
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
          )}
        </View>
      </View>

      {/* Action buttons row */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={onAddPress}
          style={({ pressed }) => [
            styles.actionButton,
            styles.addButton,
            pressed && styles.actionButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add to Space"
          testID="header-add-button"
        >
          <Plus size={18} color={BRAND.colors.mossGreen} />
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>

        {pinnedCount > 0 && (
          <Pressable
            onPress={onPinnedPress}
            style={({ pressed }) => [
              styles.actionButton,
              styles.pinnedButton,
              pressed && styles.actionButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${pinnedCount} pinned items`}
            testID="header-pinned-button"
          >
            <Pin size={16} color={BRAND.colors.mossGreen} />
            <Text style={styles.pinnedButtonText}>{pinnedCount} pinned</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.colors.linenCream,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },

  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  backArrow: {
    fontSize: 28,
    color: BRAND.colors.charcoalInk,
    fontWeight: '600',
  },
  spaceName: {
    fontSize: 24,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },

  // Main content
  mainContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
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
  milestoneName: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
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

  // Action row
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  addButton: {
    backgroundColor: 'rgba(191, 216, 192, 0.4)',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  pinnedButton: {
    backgroundColor: 'rgba(191, 216, 192, 0.25)',
  },
  pinnedButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
});

export default MilestoneHeader;
