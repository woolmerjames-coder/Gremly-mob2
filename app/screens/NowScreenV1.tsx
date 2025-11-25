/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowVaultBar } from '../../components/now/NowVaultBar';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { OverwhelmButton } from '../../components/now/OverwhelmButton';
import { useNowData } from '../../lib/now/useNowData';

export default function NowScreenV1() {
  const now = useNowData();

  if (now.loading) {
    return <Screen style={styles.screen}>{/* TODO: Add loading state */}</Screen>;
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
