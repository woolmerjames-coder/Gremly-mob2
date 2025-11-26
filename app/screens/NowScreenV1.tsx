/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowWeeklySummary } from '../../components/now/NowWeeklySummary';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { NowOverwhelmCard } from '../../components/now/NowOverwhelmCard';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { NowWeekPopup } from '../../components/now/NowWeekPopup';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import { useNowData } from '../../lib/now/useNowData';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

export default function NowScreenV1() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const now = useNowData();
  const overwhelm = useOverwhelmFlow();
  const [isProgressVisible, setProgressVisible] = useState(false);
  const [isWeekVisible, setWeekVisible] = useState(false);
  const [isSweepVisible, setSweepVisible] = useState(false);

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

  // Handle sweep press
  const handleSweepPress = useCallback(() => {
    // Open sweep modal (same for both quick sweep and regular sweep)
    setSweepVisible(true);
  }, []);

  if (now.loading) {
    return (
      <Screen style={styles.screen}>
        <View />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <NowHeader
        dateTimeLabel={now.dateTimeLabel}
        progressState={now.progressState}
        weekStatus={now.weekStatus}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
      />
      <NowWeeklySummary
        stats={{
          lists: now.vaultSummary.thisWeekStats.listCount,
          journals: now.vaultSummary.thisWeekStats.journalCount,
          ideas: now.vaultSummary.thisWeekStats.ideaCount,
        }}
      />
      <View style={styles.weekSummaryDivider} />
      <Text style={styles.sectionTitle}>Today’s Focus</Text>
      <NowList
        lockedItems={now.lockedItems}
        activeItems={now.activeItems}
        futureItems={now.futureItems}
        progressPercent={now.progressState.percent}
        onPressItem={handlePressItem}
        onToggleComplete={handleToggleComplete}
      />
      <NowOverwhelmCard onPress={overwhelm.open} />
      <NowSweepBar hasYesterdayCarryOver={now.hasYesterdayCarryOver} onPress={handleSweepPress} />

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

      <SweepDrawer visible={isSweepVisible} onClose={() => setSweepVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    position: 'relative',
  },
  weekSummaryDivider: {
    marginTop: 0,
    marginBottom: 24,
    height: 1,
    marginHorizontal: 24,
    backgroundColor: '#E7E2D9',
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 12,
    paddingHorizontal: 24,
    fontSize: 14,
    fontWeight: '600',
    color: '#0E1116',
  },
});
