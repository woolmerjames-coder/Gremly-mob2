// Diagnostic only; not mounted in production.
import React from 'react';
import { View, Text } from 'react-native';

export default function NativeWindProbe() {
  return (
    <View className="p-4 gap-4">
      <View className="flex-row gap-4">
        <View className="w-12 h-12 bg-deepTeal" />
        <View className="w-12 h-12 bg-cream" />
        <View className="w-12 h-12 bg-mint" />
        <View className="w-12 h-12 bg-periwinkle" />
      </View>
      <Text className="text-deepTeal-900 font-bold text-xl">NativeWind OK</Text>
    </View>
  );
}
