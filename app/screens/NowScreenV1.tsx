/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 */

import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowVaultBar } from '../../components/now/NowVaultBar';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { OverwhelmButton } from '../../components/now/OverwhelmButton';
import { useNowData } from '../../lib/now/useNowData';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

export default function NowScreenV1() {
  const now = useNowData();

  // Shared interactions from Today screen
  const interactions = useTodayInteractions({
    onReload: now.reload,
    celebrationEnabled: false, // Can enable later
  });

  // Handle item press - open overlay
  const handlePressItem = useCallback(
    (item: NowLockedItem | NowActiveItem | NowFutureItem) => {
      interactions.openEntityOverlay(item);
    },
    [interactions],
  );

  // Handle toggle complete - type-narrow and delegate
  const handleToggleComplete = useCallback(
    (item: NowLockedItem | NowActiveItem | NowFutureItem) => {
      if (item.type === 'todo') {
        void interactions.toggleTodoComplete(item);
      } else if (item.type === 'habit') {
        void interactions.toggleHabitComplete(item);
      }
    },
    [interactions],
  );

  if (now.loading) {
    return (
      <Screen style={styles.screen}>
        <View>{/* TODO: Add loading state */}</View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <NowHeader
        greeting={now.greeting}
        dateTimeLabel={now.dateTimeLabel}
        progressState={now.progressState}
        weekStatus={now.weekStatus}
      />
      <NowVaultBar summary={now.vaultSummary} />
      <NowList
        lockedItems={now.lockedItems}
        activeItems={now.activeItems}
        futureItems={now.futureItems}
        onPressItem={handlePressItem}
        onToggleComplete={handleToggleComplete}
      />
      <NowSweepBar hasYesterdayCarryOver={now.hasYesterdayCarryOver} />
      <OverwhelmButton />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});
