import React from 'react';
import { Text } from 'react-native';
import Screen from '../../components/layout/Screen';

export default function SpacesScreen() {
  return (
    <Screen title="Spaces" scroll testID="screen-spaces">
      <Text className="text-base text-text-primary">
        Grid/list of Spaces. Inside: banner, chat, items.
      </Text>
    </Screen>
  );
}
