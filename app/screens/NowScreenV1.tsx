/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowVaultBar } from '../../components/now/NowVaultBar';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { OverwhelmButton } from '../../components/now/OverwhelmButton';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { NowWeekPopup } from '../../components/now/NowWeekPopup';
import { useNowData } from '../../lib/now/useNowData';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

export default function NowScreenV1() {
  const now = useNowData();
  const overwhelm = useOverwhelmFlow();
  const [isProgressVisible, setProgressVisible] = useState(false);
  const [isWeekVisible, setWeekVisible] = useState(false);

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

  // Handle overwhelm plan submission
  const handleOverwhelmSubmit = useCallback(() => {
    const selectedItems = [...now.lockedItems, ...now.activeItems]
      .filter((item) => overwhelm.selectedIds.includes(item.id))
      .map((item) => ({ id: item.id, title: item.name }));

    void overwhelm.requestPlan(selectedItems);
  }, [overwhelm, now.lockedItems, now.activeItems]);

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
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
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
      <OverwhelmButton onPress={overwhelm.open} />

      <NowProgressPopup
        visible={isProgressVisible}
        completed={now.completedToday}
        onClose={() => setProgressVisible(false)}
      />

      <NowWeekPopup
        visible={isWeekVisible}
        summaries={now.weeklySummaries}
        onClose={() => setWeekVisible(false)}
      />

      <OverwhelmSelectSheet
        visible={overwhelm.step === 'select'}
        items={[...now.lockedItems, ...now.activeItems]}
        selectedIds={overwhelm.selectedIds}
        onToggleSelect={overwhelm.toggleSelection}
        onSubmit={handleOverwhelmSubmit}
        onClose={overwhelm.close}
      />

      <OverwhelmPlanSheet
        visible={overwhelm.step === 'planning'}
        plan={overwhelm.plan}
        isLoading={overwhelm.isLoading}
        onEnterFocus={overwhelm.enterFocusMode}
        onChangeSelection={overwhelm.open}
        onClose={overwhelm.close}
      />

      <OverwhelmFocusOverlay
        visible={overwhelm.step === 'focus'}
        plan={overwhelm.plan}
        onExit={overwhelm.exitFocusMode}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});
