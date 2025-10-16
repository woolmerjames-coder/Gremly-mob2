import React from 'react';
import { View, StyleSheet } from 'react-native';
// Optional: If lottie-react-native isn't installed in tests, fall back to a simple View
let LottieView: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LottieView = require('lottie-react-native');
  LottieView = LottieView.default || LottieView;
} catch {
  LottieView = () => (
    <View
      style={{
        width: 220,
        height: 220,
        backgroundColor: 'rgba(183,247,225,0.3)',
        borderRadius: 110,
      }}
    />
  );
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
