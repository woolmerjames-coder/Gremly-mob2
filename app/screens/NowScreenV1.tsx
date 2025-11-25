/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowVaultBar } from '../../components/now/NowVaultBar';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { OverwhelmButton } from '../../components/now/OverwhelmButton';

export default function NowScreenV1() {
  return (
    <Screen style={styles.screen}>
      <NowHeader />
      <NowVaultBar />
      <NowList />
      <NowSweepBar />
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
