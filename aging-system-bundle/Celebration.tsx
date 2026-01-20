import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type LottieComponentProps = {
  source: unknown;
  autoPlay?: boolean;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
} & Record<string, unknown>;

const fallbackLottieStyle: ViewStyle = {
  width: 220,
  height: 220,
  backgroundColor: 'rgba(183,247,225,0.3)',
  borderRadius: 110,
};

let LottieView: React.ComponentType<LottieComponentProps>;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rawModule = require('lottie-react-native');
  const candidate = rawModule.default ?? rawModule;
  if (typeof candidate === 'function') {
    LottieView = candidate as React.ComponentType<LottieComponentProps>;
  } else {
    throw new Error('Lottie module is not a component');
  }
} catch {
  LottieView = ({ style }) => <View style={[fallbackLottieStyle, style]} />;
}

export default function Celebration({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View testID="celebration" style={styles.overlay} pointerEvents="none">
      <LottieView
        source={require('../assets/lottie/confetti.json')}
        autoPlay
        loop={false}
        style={{ width: 220, height: 220 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
