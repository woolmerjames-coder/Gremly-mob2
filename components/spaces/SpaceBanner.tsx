/**
 * SpaceBanner - Header banner for Space Home screen
 * Shows space icon, name, theme color, and action buttons
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import type { Space } from '../../lib/types';
import { lightTokens } from '../../design/tokens';

interface SpaceBannerProps {
  space: Space;
  onEdit?: () => void;
  onSettings?: () => void;
}

const THEME_COLORS = {
  deepTeal: '#0D7C7C',
  mint: '#7FCDBB',
  cream: '#FFF4E0',
  periwinkle: '#B8B8E8',
} as const;

export function SpaceBanner({ space, onEdit, onSettings }: SpaceBannerProps) {
  const themeColor = space.theme ? THEME_COLORS[space.theme] : THEME_COLORS.mint;
  const isLightTheme = space.theme === 'cream' || space.theme === 'periwinkle';

  return (
    <View style={[styles.container, { backgroundColor: themeColor }]}>
      <View style={styles.content}>
        {/* Icon and Name */}
        <View style={styles.leftSection}>
          <Text style={styles.icon}>{space.icon || '⭐️'}</Text>
          <View style={styles.textSection}>
            <Text style={[styles.name, isLightTheme && styles.darkText]}>{space.name}</Text>
            <Text style={[styles.subtitle, isLightTheme && styles.darkText]}>
              {space.archived_at ? 'Archived' : 'Active Space'}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onEdit}
              accessibilityLabel="Edit space"
              accessibilityRole="button"
            >
              <Text style={[styles.actionIcon, isLightTheme && styles.darkText]}>✏️</Text>
            </TouchableOpacity>
          )}
          {onSettings && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onSettings}
              accessibilityLabel="Space settings"
              accessibilityRole="button"
            >
              <Text style={[styles.actionIcon, isLightTheme && styles.darkText]}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: lightTokens.spacing[4],
    paddingBottom: lightTokens.spacing[5],
    paddingHorizontal: lightTokens.spacing[5],
    borderBottomLeftRadius: lightTokens.radius[3],
    borderBottomRightRadius: lightTokens.radius[3],
    ...lightTokens.elevation.md,
  } as ViewStyle,
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 48,
    marginRight: lightTokens.spacing[4],
  },
  textSection: {
    flex: 1,
  },
  name: {
    fontSize: lightTokens.typography.size.xl,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: lightTokens.spacing[1],
  },
  subtitle: {
    fontSize: lightTokens.typography.size.sm,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  darkText: {
    color: lightTokens.colors.text,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTokens.spacing[2],
  },
  actionButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionIcon: {
    fontSize: 20,
  },
});
