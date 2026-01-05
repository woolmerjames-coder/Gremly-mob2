import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable, Image, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { BRAND } from '../../../design/brand';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- React Native image import
const GREMLY_FACE = require('../../../assets/buttonforHP.png');

export type MiniSweepPosition = 'archive' | 'defer' | 'today';

interface MiniSweepToggleProps {
  value: MiniSweepPosition;
  onChange: (value: MiniSweepPosition) => void;
  disabled?: boolean;
}

const TRACK_HEIGHT = 32;
const INDICATOR_SIZE = 40;

// Position colors
const COLORS = {
  archive: {
    track: '#E8E6E1',
    accent: '#A8A5A0',
  },
  defer: {
    track: 'rgba(156, 166, 224, 0.15)',
    accent: BRAND.colors.periwinkleSmoke,
  },
  today: {
    track: BRAND.colors.sageMist,
    accent: BRAND.colors.mossGreen,
  },
};

// Position value: -1 (archive), 0 (defer), 1 (today)
const POSITION_VALUE: Record<MiniSweepPosition, number> = {
  archive: -1,
  defer: 0,
  today: 1,
};

export function MiniSweepToggle({ value, onChange, disabled = false }: MiniSweepToggleProps) {
  const [trackWidth, setTrackWidth] = React.useState(0);

  // Animation value: -1 (archive), 0 (defer), 1 (today)
  const position = useSharedValue(POSITION_VALUE[value]);

  // Update position when value changes externally
  useEffect(() => {
    position.value = withTiming(POSITION_VALUE[value], {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, position]);

  // Handle tap on specific zone
  const handleTap = React.useCallback(
    (zone: MiniSweepPosition) => {
      if (disabled) return;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value update
      position.value = withTiming(POSITION_VALUE[zone], {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      });
      onChange(zone);
    },
    [disabled, onChange, position],
  );

  // Animated indicator style - slides based on position value
  const indicatorStyle = useAnimatedStyle(() => {
    // Calculate center position (defer = center of track)
    const centerX = (trackWidth - INDICATOR_SIZE) / 2;
    // Each zone is 1/3 of track, so offset by 1/3 of track width
    const offset = position.value * (trackWidth / 3);

    return {
      transform: [{ translateX: centerX + offset }],
    };
  });

  // Animated track background color
  const trackStyle = useAnimatedStyle(() => {
    // Map position (-1, 0, 1) to color index (0, 1, 2)
    const colorIndex = position.value + 1;
    const backgroundColor = interpolateColor(
      colorIndex,
      [0, 1, 2],
      [COLORS.archive.track, COLORS.defer.track, COLORS.today.track],
    );
    return { backgroundColor };
  });

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View
        style={styles.trackContainer}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.track, trackStyle]}>
          {/* In-track text feedback */}
          {value === 'today' && (
            <Text style={[styles.trackText, styles.trackTextLeft]}>adding to today's list</Text>
          )}
          {value === 'archive' && (
            <Text style={[styles.trackText, styles.trackTextRight]}>archiving this</Text>
          )}

          {/* Tap zones */}
          <View style={styles.zonesContainer}>
            <Pressable
              style={styles.zone}
              onPress={() => handleTap('archive')}
              disabled={disabled}
            />
            <Pressable style={styles.zone} onPress={() => handleTap('defer')} disabled={disabled} />
            <Pressable style={styles.zone} onPress={() => handleTap('today')} disabled={disabled} />
          </View>

          {/* Sliding Gremly indicator */}
          {trackWidth > 0 && (
            <Animated.View style={[styles.indicator, indicatorStyle]}>
              <Image source={GREMLY_FACE} style={styles.gremlyFace} />
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  trackContainer: {
    width: '100%',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: COLORS.archive.track,
    justifyContent: 'center',
  },
  zonesContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  zone: {
    flex: 1,
    height: '100%',
  },
  trackText: {
    position: 'absolute',
    fontSize: 10,
    color: BRAND.colors.inkMuted,
    top: '50%',
    transform: [{ translateY: -6 }],
  },
  trackTextLeft: {
    left: 12,
  },
  trackTextRight: {
    right: 12,
  },
  indicator: {
    position: 'absolute',
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gremlyFace: {
    width: 36,
    height: 36,
  },
});

export default MiniSweepToggle;
