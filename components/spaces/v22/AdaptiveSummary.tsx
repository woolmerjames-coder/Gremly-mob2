import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { MessageSquare } from '../../icons';

export type AdaptiveMode = 'reflective' | 'progress' | 'catchup' | 'planning';

export type AdaptiveSummaryProps = {
  mode: AdaptiveMode;
  text?: string; // Optional: if omitted, will map from intent + nextItem
  intent?: 'habit' | 'trip' | 'goal' | 'other';
  nextItem?: { title?: string; dateLabel?: string } | null;
  spaceName?: string;
  onPrimary?: () => void; // Primary: Add Next Step
  onSecondary?: () => void; // Secondary: Save as Note
};

export const AdaptiveSummary: React.FC<AdaptiveSummaryProps> = ({
  mode: _mode,
  text,
  intent,
  nextItem,
  spaceName,
  onPrimary,
  onSecondary,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  // using a subtle pear top border; no accent fill needed
  const resolvedText = React.useMemo(() => {
    if (text) return text;
    // Mode-first copy with second-person voice
    const modeCopy: Record<AdaptiveMode, string> = {
      reflective: 'You’ve been reflecting here. Want to save a quick note or add a next step?',
      progress: 'You’re making steady progress. Ready to take the next step?',
      catchup:
        'It’s been a little while. Want to catch up on what changed and plan your next move?',
      planning: 'Let’s plan ahead together. What’s the next step you’d like to take?',
    };
    // If we have intent-specific context, append lightly
    let base = modeCopy[_mode as AdaptiveMode] || modeCopy.planning;
    if (intent === 'goal' && spaceName) base = `${base} In ${spaceName}, you’re right on track.`;
    if (intent === 'trip' && nextItem?.dateLabel)
      base = `${base} Next key date: ${nextItem.dateLabel}.`;
    return base;
  }, [_mode, text, intent, nextItem?.dateLabel, spaceName]);
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
      <View style={[styles.topBorder]} />
      <View style={styles.headerRow}>
        <MessageSquare color={COLORS.Moss} size={18} />
      </View>
      <Text style={styles.lead} accessibilityRole="header">
        What we discussed
      </Text>
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
              accessibilityLabel="Save as Note"
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryText}>Save as Note</Text>
            </TouchableOpacity>
          )}
          {onPrimary && (
            <TouchableOpacity
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel="Add Next Step"
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryText}>Add Next Step</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// getAccent removed: using subtle Pear top border instead of accent fills

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: RADII.btn,
    padding: SPACE.md,
  },
  topBorder: {
    borderTopColor: COLORS.Pear,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    marginBottom: SPACE.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  lead: {
    color: COLORS.Deep,
    fontSize: 13,
    fontWeight: '700',
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
    borderRadius: 12,
  },
  secondaryText: {
    color: COLORS.Moss,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#436653', // Moss lightened ~10%
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  primaryText: {
    color: COLORS.Linen,
    fontWeight: '700',
  },
});

export default AdaptiveSummary;
