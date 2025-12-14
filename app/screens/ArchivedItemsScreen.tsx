/**
 * ArchivedItemsScreen.tsx
 * Phase 3 placeholder - Shows archived items
 *
 * TODO: Phase 3 will implement:
 * - Full list of archived items with search
 * - Filtering by type
 * - Unarchive functionality
 * - Search archived items with query parameter
 */

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { colors, spacing } from '../../theme/tokens';
import { type as typeStyles } from '../../theme/typography';

export default function ArchivedItemsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={typeStyles.h1}>Archived Items</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.emoji}>📦</Text>
        <Text style={styles.title}>Coming Soon</Text>
        <Text style={styles.subtitle}>
          Your archived items will appear here in a future update.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  backButton: {
    marginBottom: spacing.sm,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.deepTeal,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray600,
    textAlign: 'center',
    lineHeight: 24,
  },
});
