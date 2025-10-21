/**
 * Mock for lottie-react-native
 * Returns a simple View to avoid requiring native Lottie in tests
 */
import React from 'react';
import { View } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function LottieView(props: any) {
  return <View testID={props.testID || 'mock-lottie'} />;
}
