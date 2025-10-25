import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { MessageSquare } from '../../icons';

export type AdaptiveMode = 'reflective' | 'progress' | 'catchup' | 'action';

export type AdaptiveSummaryProps = {
  mode: AdaptiveMode;
  text: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export const AdaptiveSummary: React.FC<AdaptiveSummaryProps> = ({
  mode,
  text,
  onPrimary,
  onSecondary,
}) => {
  const accent = getAccent(mode);
  return (
    <View style={[styles.wrap, { borderColor: COLORS.Sage }]} accessibilityRole="summary">
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.headerRow}>
        <MessageSquare color={COLORS.Moss} size={18} />
      </View>
      <Text style={styles.body} numberOfLines={3}>
        {text}
      </Text>
      {(onPrimary || onSecondary) && (
        <View style={styles.actions}>
          {onSecondary && (
            <TouchableOpacity
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel="Secondary action"
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryText}>Later</Text>
            </TouchableOpacity>
          )}
          {onPrimary && (
            <TouchableOpacity
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel="Primary action"
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryText}>Do it now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

function getAccent(mode: AdaptiveMode): string {
  switch (mode) {
    case 'reflective':
      return COLORS.Sage;
    case 'progress':
      return COLORS.Pear;
    case 'catchup':
      return COLORS.Periwinkle;
    case 'action':
      return COLORS.Moss;
    default:
      return COLORS.Sage;
  }
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(249, 246, 241, 0.95)', // Linen 95%
    borderWidth: 1,
    borderRadius: RADII.btn,
    padding: SPACE.md,
  },
  accent: {
    height: 3,
    borderRadius: 2,
    marginBottom: SPACE.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  body: {
    color: COLORS.Text,
    fontSize: 14.5,
    fontFamily: 'Inter-Regular',
  },
  actions: {
    marginTop: SPACE.sm,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    backgroundColor: COLORS.Sage,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryText: {
    color: COLORS.Moss,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  primaryText: {
    color: COLORS.Linen,
    fontWeight: '700',
  },
});

export default AdaptiveSummary;
