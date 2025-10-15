import React from 'react';
import { Text } from 'react-native';
import Screen from '../../components/layout/Screen';

export default function HubScreen() {
  return (
    <Screen title="Hub" scroll testID="screen-hub">
      <Text className="text-base text-text-primary">
        All | Habits | To-Dos | Journal | Lists + Sorting Tray
      </Text>
    </Screen>
  );
}
