/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { NowHelperRow } from '../../components/now/NowHelperRow';
import { NowLockedItemCard } from '../../components/now/NowLockedItemCard';
import { NowActiveItemCard } from '../../components/now/NowActiveItemCard';
import { NowFutureDivider } from '../../components/now/NowFutureDivider';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { NowWeekPopup } from '../../components/now/NowWeekPopup';
import SweepDrawer from '../../components/today/v3/SweepDrawer';
import { useNowData } from '../../lib/now/useNowData';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';

export default function NowScreenV1() {
  const now = useNowData();
  const overwhelm = useOverwhelmFlow();
  const overlayController = useUnifiedOverlayController();
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

  const handleAddMore = useCallback(() => {
    overlayController.openCreate({ type: 'todo' });
  }, [overlayController]);

  const capturesCountFromVault =
    now.vaultSummary.thisWeekStats.listCount +
    now.vaultSummary.thisWeekStats.journalCount +
    now.vaultSummary.thisWeekStats.ideaCount;
  const capturesCount =
    typeof now.capturesCount === 'number' ? now.capturesCount : capturesCountFromVault;

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
        progressPercent={now.progressState.percent / 100}
        weeklySummaries={now.weeklySummaries}
        capturesCount={capturesCount}
        completedCount={now.progressState.completedCount}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
      />
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>
          Today's Focus ({now.progressState.completedCount} completed)
        </Text>
      </View>
      <TodayFocusList
        lockedItems={now.lockedItems}
        activeItems={now.activeItems}
        futureItems={now.futureItems}
        progressPercent={now.progressState.percent}
        onPressItem={handlePressItem}
        onToggleComplete={handleToggleComplete}
        onPressOverwhelm={overwhelm.open}
        onPressAddMore={handleAddMore}
      />
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

type TodayFocusListProps = {
  lockedItems: NowLockedItem[];
  activeItems: NowActiveItem[];
  futureItems: NowFutureItem[];
  progressPercent: number;
  onPressItem?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  onToggleComplete?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  onPressOverwhelm: () => void;
  onPressAddMore: () => void;
};

function TodayFocusList({
  lockedItems,
  activeItems,
  futureItems,
  progressPercent,
  onPressItem,
  onToggleComplete,
  onPressOverwhelm,
  onPressAddMore,
}: TodayFocusListProps) {
  const hasNoItems = lockedItems.length === 0 && activeItems.length === 0;
  const isAllComplete = progressPercent === 100;

  return (
    <ScrollView
      style={styles.listContainer}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    >
      {isAllComplete && !hasNoItems && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>🎉 All done for today!</Text>
        </View>
      )}

      {hasNoItems && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nothing scheduled for today.</Text>
          <Text style={styles.emptySubtext}>Enjoy a calmer day — or try a Sweep.</Text>
        </View>
      )}

      {lockedItems.map((item) => (
        <NowLockedItemCard
          key={item.id}
          item={item}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {activeItems.map((item) => (
        <NowActiveItemCard
          key={item.id}
          item={item}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {futureItems.length > 0 && <NowFutureDivider />}

      {futureItems.map((item) => (
        <NowActiveItemCard
          key={item.id}
          item={item}
          future
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      <NowHelperRow onPressOverwhelm={onPressOverwhelm} onPressAddMore={onPressAddMore} />
      <View style={styles.listBottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    position: 'relative',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: -16,
    marginBottom: 12,
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  banner: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  listBottomSpacer: {
    height: 120,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0E1116',
    marginTop: 16,
  },
});
