import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { Search, Settings, Bot } from '../../icons';
import SearchOverlay from './Overlays/SearchOverlay';

export type HeaderTone = 'calm' | 'neutral' | 'proud' | 'low';

export type HeaderProps = {
  title: string;
  lastVisited?: string;
  contextLine?: { text: string; tone: HeaderTone };
  onSearch?: () => void;
  onSettings?: () => void;
  onBack?: () => void;
  mascotState?: 'calm' | 'focused' | 'proud' | 'playful';
  spaceId?: string; // for SearchOverlay scoping
};

export const Header: React.FC<HeaderProps> = ({
  title,
  lastVisited,
  contextLine,
  onSearch,
  onSettings,
  onBack,
  mascotState = 'calm',
  spaceId,
}) => {
  const [showSearch, setShowSearch] = React.useState(false);
  // Mascot micro-animations
  const mScale = React.useMemo(() => new Animated.Value(1), []);
  const mRotate = React.useMemo(() => new Animated.Value(0), []);
  const mTranslateY = React.useMemo(() => new Animated.Value(0), []);
  React.useEffect(() => {
    mScale.stopAnimation();
    mRotate.stopAnimation();
    mTranslateY.stopAnimation();
    // reset
    mScale.setValue(1);
    mRotate.setValue(0);
    mTranslateY.setValue(0);
    if (mascotState === 'calm') {
      // gentle breathing loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(mScale, {
            toValue: 1.05,
            duration: 1200,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(mScale, {
            toValue: 1,
            duration: 1200,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else if (mascotState === 'focused') {
      // quick head tilt
      Animated.sequence([
        Animated.timing(mRotate, { toValue: -8, duration: 150, useNativeDriver: true }),
        Animated.timing(mRotate, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    } else if (mascotState === 'proud') {
      // scale pulse
      Animated.sequence([
        Animated.timing(mScale, { toValue: 1.18, duration: 160, useNativeDriver: true }),
        Animated.timing(mScale, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else if (mascotState === 'playful') {
      // small peek (pop up then settle)
      Animated.sequence([
        Animated.timing(mTranslateY, { toValue: -3, duration: 160, useNativeDriver: true }),
        Animated.timing(mTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [mascotState, mScale, mRotate, mTranslateY]);
  const contextColor = getContextColor(contextLine?.tone);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {/* Back chevron as text glyph to avoid adding another icon */}
          <Text style={styles.chevron}>‹</Text>
        </TouchableOpacity>

        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!lastVisited && (
            <Text style={styles.subline} numberOfLines={1}>
              {lastVisited}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          {/* Small Gremly avatar */}
          <Animated.View
            style={{
              transform: [
                { scale: mScale },
                {
                  rotate: mRotate.interpolate({
                    inputRange: [-180, 180],
                    outputRange: ['-180deg', '180deg'],
                  }),
                },
                { translateY: mTranslateY },
              ],
            }}
            accessibilityLabel={`Gremly avatar: ${mascotState}`}
          >
            <Bot color={COLORS.Linen} size={18} />
          </Animated.View>
          <TouchableOpacity
            onPress={() => setShowSearch(true)}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Search color={COLORS.Linen} size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Settings color={COLORS.Linen} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {!!contextLine?.text && (
        <Text style={[styles.context, { color: contextColor }]} numberOfLines={2}>
          {contextLine.text}
        </Text>
      )}
      {/* Soft fade under header to mimic gradient */}
      <View style={styles.fadeUnder} />
      {/* Search overlay (slides under header) */}
      <SearchOverlay visible={showSearch} onClose={() => setShowSearch(false)} spaceId={spaceId} />
    </View>
  );
};

function getContextColor(tone: HeaderTone | undefined): string {
  switch (tone) {
    case 'proud':
      return COLORS.Pear;
    case 'neutral':
      return COLORS.Sage;
    case 'calm':
      return COLORS.Sage;
    case 'low':
      return COLORS.Sage;
    default:
      return COLORS.Sage;
  }
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: SPACE.md,
    paddingVertical: 18,
    borderBottomLeftRadius: RADII.header,
    borderBottomRightRadius: RADII.header,
    // subtle drop shadow
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: {
    color: COLORS.Linen,
    fontSize: 22,
    lineHeight: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACE.sm,
  },
  title: {
    color: COLORS.Linen,
    fontSize: 21,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  subline: {
    marginTop: 2,
    color: COLORS.Sage,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  context: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  fadeUnder: {
    height: 12,
    marginTop: 8,
    // approximate soft gradient with a translucent Moss tint
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderBottomLeftRadius: RADII.header,
    borderBottomRightRadius: RADII.header,
  },
});

export default Header;
