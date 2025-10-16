import React from 'react';
import { render } from '@testing-library/react-native';
import { View, Text } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Minimal smoke test just verifies className prop doesn't crash
function Sample() {
  return (
    <View className="p-2">
      <View className="h-4 w-4 bg-deepTeal" />
      <Text className="text-deepTeal-900">OK</Text>
    </View>
  );
}

test('renders a component with NativeWind className without crashing', () => {
  const { getByText } = render(<Sample />);
  expect(getByText('OK')).toBeTruthy();
});
