import React from 'react';
import { Image, View } from 'react-native';
import { makeStyles } from '../../design/makeStyles';
import GREMLY_CLIPBOARD from '../../assets/mascot/clipboardgremly.png';

export function NowTodayMascot() {
  const styles = useStyles();

  return (
    <View
      style={styles.container}
      accessibilityLabel="Gremly mascot"
      accessibilityRole="image"
      pointerEvents="none"
    >
      <Image source={GREMLY_CLIPBOARD} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  container: {
    width: 58,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: 52,
    height: 52,
  },
}));
