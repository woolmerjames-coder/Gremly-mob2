import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { MessageSquare } from '../../icons';

export type AdaptiveMode = 'reflective' | 'progress' | 'catchup' | 'action';

export type AdaptiveSummaryProps = {
  mode: AdaptiveMode;
  text?: string; // Optional: if omitted, will map from intent + nextItem
  intent?: 'habit' | 'trip' | 'goal' | 'other';
  nextItem?: { title?: string; dateLabel?: string } | null;
  spaceName?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export const AdaptiveSummary: React.FC<AdaptiveSummaryProps> = ({
  mode,
  text,
  intent,
  nextItem,
  spaceName,
  onPrimary,
  onSecondary,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const accent = getAccent(mode);
  const resolvedText = React.useMemo(() => {
    if (text) return text;
    switch (intent) {
      case 'habit':
        return 'You’re building rhythm here. Want to review today’s check-ins?';
      case 'trip': {
        const title = nextItem?.title ? `${nextItem.title} ` : '';
        const when = nextItem?.dateLabel ? nextItem.dateLabel : '';
        return when
          ? `Next key date: ${title}${when}.`
          : 'Have travel coming up. Want to review key dates?';
      }
      case 'goal':
        return `Ready for your next step${spaceName ? ` in ${spaceName}` : ''}?`;
      default:
        return 'What should we focus on today?';
    }
  }, [text, intent, nextItem?.title, nextItem?.dateLabel, spaceName]);
  return (
    <View
      style={[
        styles.wrap,
        isDark
          ? { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }
          : { backgroundColor: 'rgba(249, 246, 241, 0.95)', borderColor: COLORS.Sage },
      ]}
      accessibilityRole="summary"
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.headerRow}>
        <MessageSquare color={COLORS.Moss} size={18} />
      </View>
      <Text
        style={[styles.body, isDark ? { color: '#EDEDE8' } : { color: COLORS.Text }]}
        numberOfLines={3}
      >
        {resolvedText}
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
