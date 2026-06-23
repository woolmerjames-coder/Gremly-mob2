import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type ActionPillProps = {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
  showGremlyStamp?: boolean;
};

export function ActionPill({
  icon,
  label,
  active,
  onPress,
  showGremlyStamp = true,
}: ActionPillProps) {
  const stampScale = useSharedValue(0.85);
  const stampOpacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      const timing = { duration: 180, easing: Easing.out(Easing.cubic) };
      stampScale.value = withTiming(1.0, timing);
      stampOpacity.value = withTiming(1, timing);
    } else {
      stampScale.value = 0.85;
      stampOpacity.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const stampAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stampScale.value }],
    opacity: stampOpacity.value,
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable onPress={handlePress}>
      <View style={[styles.container, active ? styles.containerActive : styles.containerInactive]}>
        {active ? (
          <LinearGradient
            colors={['#BFD8C0', 'rgba(191,216,192,0.7)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.row}>
          {icon !== undefined ? (
            <View style={[styles.iconBox, active ? styles.iconBoxActive : styles.iconBoxInactive]}>
              {icon}
            </View>
          ) : null}
          <Text
            style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {active && showGremlyStamp ? (
            <Animated.View style={[styles.stamp, stampAnimatedStyle]}>
              <Image
                source={require('../../assets/buttonforHP.png')}
                style={styles.stampImage}
                resizeMode="cover"
              />
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
  },
  containerInactive: {
    backgroundColor: 'rgba(191,216,192,0.04)',
    borderColor: 'rgba(191,216,192,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  containerActive: {
    borderColor: '#8BB896',
    shadowColor: 'rgba(46,85,64,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxInactive: {
    backgroundColor: 'rgba(34,34,34,0.03)',
  },
  iconBoxActive: {
    backgroundColor: 'rgba(46,85,64,0.12)',
  },
  label: {
    fontSize: 14.5,
    letterSpacing: -0.1,
    flex: 1,
  },
  labelInactive: {
    fontWeight: '400',
    color: 'rgba(34,34,34,0.45)',
    fontFamily: 'Inter-Regular',
  },
  labelActive: {
    fontWeight: '700',
    color: '#1A3328',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  stamp: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: 'rgba(46,85,64,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  stampImage: {
    width: 28,
    height: 28,
  },
});
