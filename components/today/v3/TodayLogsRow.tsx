/**
 * TodayLogsRow - Full-width tappable card showing today's log count
 *
 * Design:
 * - Subtle pill/card background (sage mist / off-white)
 * - Left: logs icon + "Logs" label + count
 * - Right: chevron disclosure indicator
 */

import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { Icon } from '../../../design-system/Icon';
import { BRAND } from '../../../design/brand';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TodayLogsRowProps = {
  /** Number of logs captured today */
  logsCount: number;
  /** Handler when row is pressed */
  onPress?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOSS_GREEN = BRAND.colors.mossGreen;
const INK_CHARCOAL = BRAND.colors.charcoalInk;
const INK_SUBTLE = BRAND.colors.inkSubtle;
const SURFACE = '#F7F5F0'; // Very light sage/cream for card background

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TodayLogsRow({ logsCount, onPress }: TodayLogsRowProps) {
  // Build count text
  const countText =
    logsCount === 0 ? 'No logs yet' : logsCount === 1 ? '1 log' : `${logsCount} logs`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Logs: ${countText}`}
    >
      {/* Left side: Icon + Text */}
      <View style={styles.leftContent}>
        <View style={styles.iconContainer}>
          <Icon name="FileText" size="md" color={MOSS_GREEN} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.label}>Logs</Text>
          <Text style={styles.countText}>{countText}</Text>
        </View>
      </View>

      {/* Right side: Chevron */}
      <View style={styles.chevronContainer}>
        <Icon name="ChevronRight" size="sm" color={INK_SUBTLE} />
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE,
    borderRadius: 16,
    paddingVertical: 10, // Slightly more compact
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 6, // Reduced for tighter grouping with cards
    marginBottom: 4,
    // Subtle elevation for depth - matches progress cards above
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: INK_CHARCOAL,
  },
  countText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
  },
  chevronContainer: {
    marginLeft: 8,
  },
});

export default TodayLogsRow;
