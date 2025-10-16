import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function NWCheck() {
  return (
    <View style={styles.wrap} testID="nwcheck-root">
      <View style={styles.box} testID="nwcheck-style-box" />
      <View className="w-12 h-12 bg-deepTeal rounded-2xl" testID="nwcheck-nw-box" />
      <Text className="text-deepTeal-900 font-bold" testID="nwcheck-text">
        NW className active?
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 8, gap: 8 },
  box: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#B7F7E1' },
});
