/**
 * OneThingCard - Morning Brief "One Thing" display
 *
 * Elevated card showing the user's anchor task for the day.
 * Appears at top of Today's Focus when brief is completed.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BRAND } from '../../../design/brand';

interface OneThingCardProps {
  /** Task title */
  title: string;
  /** Task type for icon/styling */
  type: 'todo' | 'habit';
  /** Called when card is pressed (open detail) */
  onPress?: () => void;
  /** Called when "Change" is pressed (reopen brief) */
  onChangePress?: () => void;
}

export function OneThingCard({ title, type, onPress, onChangePress }: OneThingCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={onPress}
      testID="one-thing-card"
      accessibilityRole="button"
      accessibilityLabel={`Your one thing: ${title}`}
    >
      {/* Sage green accent bar */}
      <View style={styles.accentBar} />

      <View style={styles.content}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.label}>Your One Thing</Text>
          {onChangePress && (
            <Pressable onPress={onChangePress} hitSlop={8} testID="one-thing-change">
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>
          )}
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* Gremly encouragement */}
        <View style={styles.gremlyRow}>
          <Text style={styles.gremlyText}>This is the one.</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.lg,
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    // Elevation
    ...BRAND.elevation.two,
  },
  containerPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.995 }],
  },
  accentBar: {
    width: 6,
    backgroundColor: BRAND.colors.mossGreen,
  },
  content: {
    flex: 1,
    padding: 16,
    paddingLeft: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  changeLink: {
    fontSize: 12,
    color: BRAND.colors.mossGreen,
    textDecorationLine: 'underline',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    lineHeight: 24,
    marginBottom: 8,
  },
  gremlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gremlyText: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    fontStyle: 'italic',
  },
});
