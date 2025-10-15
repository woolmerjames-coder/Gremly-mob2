import React from 'react';
import { Text } from 'react-native';
import Screen from '../../components/layout/Screen';

export default function MeScreen() {
  return (
    <Screen title="Me" scroll testID="screen-me">
      <Text className="text-base text-text-primary">
        Streaks & Wins, Progress %, Mood check + mini journal.
      </Text>
    </Screen>
  );
}
