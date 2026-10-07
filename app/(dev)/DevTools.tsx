/**
 * DevTools - Developer utilities for testing app features
 *
 * This screen provides buttons to test various features without
 * going through normal flows. Only available in __DEV__ mode.
 */

import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Text } from '../../ui/Text';
import { Button } from '../../design-system/Button';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import celebrationController from '../features/celebration/CelebrationController';
import { colors, spacing, radii } from '../../theme/tokens';

export default function DevTools() {
  const navigation = useNavigation();
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const todayDropsCount = useGremlyStore((s) => s.todayDropsCount);
  const todaySweepsCount = useGremlyStore((s) => s.todaySweepsCount);
  const [lastAction, setLastAction] = useState<string | null>(null);

  /**
   * Play a fed day (1, 2) or the third day that runs into the age up, on the
   * Drop page, without touching the store. The age up's server confirmation
   * is stood in for a second after the start, as it would arrive.
   */
  const handlePlayMoment = (day: 1 | 2 | 3) => {
    navigation.goBack();
    setTimeout(() => {
      celebrationController.startMoment({ day, age: gremlyAge });
      if (day === 3) setTimeout(() => celebrationController.confirmAgeUp(gremlyAge + 1), 1000);
    }, 400);
  };

  /**
   * Reset gremlyAge to 0 for testing
   */
  const handleResetGremlyAge = () => {
    Alert.alert('Reset Gremly Age', "This will reset Gremly's age to 0. Are you sure?", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          useGremlyStore.setState({ gremlyAge: 0 });
          setLastAction('✅ Reset gremlyAge to 0');
          setTimeout(() => setLastAction(null), 5000);
        },
      },
    ]);
  };

  /**
   * The age up on its own at a given age, the way it plays when the server
   * confirms after a fed day has finished.
   */
  const handleSetMilestone = (age: number) => {
    navigation.goBack();
    setTimeout(() => {
      celebrationController.startAgeUp({ age: age - 1, nextAge: age });
    }, 400);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" style={styles.title}>
          🛠️ Dev Tools
        </Text>
        <Text variant="body" style={styles.subtitle}>
          Testing utilities (DEV only)
        </Text>

        {lastAction && (
          <View style={styles.resultBanner}>
            <Text style={styles.resultText}>{lastAction}</Text>
          </View>
        )}

        {/* Current State */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Current State
          </Text>
          <View style={styles.stateRow}>
            <Text variant="body">Gremly Age:</Text>
            <Text variant="body" style={styles.stateValue}>
              {gremlyAge}
            </Text>
          </View>
          <View style={styles.stateRow}>
            <Text variant="body">Today's Drops:</Text>
            <Text variant="body" style={styles.stateValue}>
              {todayDropsCount}
            </Text>
          </View>
          <View style={styles.stateRow}>
            <Text variant="body">Today's Sweeps:</Text>
            <Text variant="body" style={styles.stateValue}>
              {todaySweepsCount}
            </Text>
          </View>
        </View>

        {/* Navigation */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            Navigation
          </Text>
          <Text variant="subtle" style={styles.hint}>
            Navigate to specific screens for testing
          </Text>

          <Button
            label="Show Paywall"
            onPress={() => (navigation as any).navigate('TrialEndPaywall', { source: 'settings' })}
            testID="show-paywall-button"
            style={styles.button}
          />
        </View>

        {/* The fed moment and the age up */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            The moment
          </Text>
          <Text variant="subtle" style={styles.hint}>
            Plays on the Drop page with haptics. Day 3 runs on into the age up.
          </Text>

          <View style={styles.buttonRow}>
            <Button
              label="Fed, day 1"
              size="sm"
              variant="secondary"
              onPress={() => handlePlayMoment(1)}
              style={styles.smallButton}
            />
            <Button
              label="Fed, day 2"
              size="sm"
              variant="secondary"
              onPress={() => handlePlayMoment(2)}
              style={styles.smallButton}
            />
          </View>
          <Button
            label={`Day 3, then the age up (${gremlyAge} to ${gremlyAge + 1})`}
            onPress={() => handlePlayMoment(3)}
            testID="trigger-age-up-button"
            style={styles.button}
          />

          <Button
            label="Reset Age to 0"
            variant="outline"
            onPress={handleResetGremlyAge}
            testID="reset-age-button"
            style={styles.button}
          />
        </View>

        {/* Milestone Celebrations */}
        <View style={styles.section}>
          <Text variant="title" style={styles.sectionTitle}>
            The age up on its own
          </Text>
          <Text variant="subtle" style={styles.hint}>
            At a given age, the way it plays when the server confirms late
          </Text>

          <View style={styles.buttonRow}>
            <Button
              label="Age 10"
              size="sm"
              variant="secondary"
              onPress={() => handleSetMilestone(10)}
              style={styles.smallButton}
            />
            <Button
              label="Age 50"
              size="sm"
              variant="secondary"
              onPress={() => handleSetMilestone(50)}
              style={styles.smallButton}
            />
            <Button
              label="Age 100"
              size="sm"
              variant="secondary"
              onPress={() => handleSetMilestone(100)}
              style={styles.smallButton}
            />
          </View>

          <View style={styles.buttonRow}>
            <Button
              label="Age 365"
              size="sm"
              variant="secondary"
              onPress={() => handleSetMilestone(365)}
              style={styles.smallButton}
            />
            <Button
              label="Age 500"
              size="sm"
              variant="secondary"
              onPress={() => handleSetMilestone(500)}
              style={styles.smallButton}
            />
            <Button
              label="Age 1000"
              size="sm"
              variant="secondary"
              onPress={() => handleSetMilestone(1000)}
              style={styles.smallButton}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
    color: colors.ink,
  },
  subtitle: {
    color: colors.gray600,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
    color: colors.ink,
  },
  hint: {
    fontSize: 14,
    color: colors.gray600,
    marginBottom: spacing.md,
  },
  button: {
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  smallButton: {
    flex: 1,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  stateValue: {
    fontWeight: '600',
    color: colors.deepTeal,
  },
  resultBanner: {
    backgroundColor: colors.mint,
    padding: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  resultText: {
    color: colors.ink,
    fontWeight: '500',
  },
});
