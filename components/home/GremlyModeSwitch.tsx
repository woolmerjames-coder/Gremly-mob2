/**
 * GremlyModeSwitch - the DROP | CHAT switch at the top of the Gremly home.
 *
 * The thumb and the dots underneath follow the pager's scroll position, so they
 * move with the user's finger while swiping. Tapping either side jumps there.
 * A green dot on CHAT marks it as new until Chat has been opened once, and a
 * one-time hint points at it the first time someone lands here.
 */

import React, { useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

export type HomeMode = 'drop' | 'chat';

const TRACK = '#E4EDE2';
const THUMB = '#BFD8C0'; // Sage Mist
const ON = '#1F3B2C';
const OFF = '#4B6A50';
const DOT_IDLE = '#C5D3C4';
const MOSS = '#2E5540';
const NEW_DOT = '#5E9E6C';

const TRACK_HEIGHT = 44;
const INSET = 4;

type Props = {
  /** 0 when Drop is showing, 1 when Chat is showing, anything between while swiping */
  progress: Animated.AnimatedInterpolation<number>;
  mode: HomeMode;
  onSelect: (mode: HomeMode) => void;
  showChatDot: boolean;
  hintVisible: boolean;
};

export default function GremlyModeSwitch({
  progress,
  mode,
  onSelect,
  showChatDot,
  hintVisible,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbWidth = trackWidth > 0 ? (trackWidth - INSET * 2) / 2 : 0;

  const thumbX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, thumbWidth],
    extrapolate: 'clamp',
  });
  const pillX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 12],
    extrapolate: 'clamp',
  });

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);
  const dropOn = mode === 'drop';

  return (
    <View style={styles.wrap}>
      <View style={styles.track} onLayout={onTrackLayout} accessibilityRole="tablist">
        {thumbWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { width: thumbWidth, transform: [{ translateX: thumbX }] }]}
          />
        )}
        <Pressable
          style={styles.half}
          onPress={() => onSelect('drop')}
          accessibilityRole="tab"
          accessibilityLabel="Drop"
          accessibilityState={{ selected: dropOn }}
          testID="home-switch-drop"
        >
          <Text style={[styles.label, { color: dropOn ? ON : OFF }]}>DROP</Text>
        </Pressable>
        <Pressable
          style={styles.half}
          onPress={() => onSelect('chat')}
          accessibilityRole="tab"
          accessibilityLabel={showChatDot ? 'Chat, new' : 'Chat'}
          accessibilityState={{ selected: !dropOn }}
          testID="home-switch-chat"
        >
          <View>
            <Text style={[styles.label, { color: dropOn ? OFF : ON }]}>CHAT</Text>
            {showChatDot && dropOn && <View style={styles.newDot} testID="home-chat-new-dot" />}
          </View>
        </Pressable>
      </View>

      {/* Two dots say "there are two pages here"; the pill slides with the swipe */}
      <View style={styles.dots} pointerEvents="none" accessibilityElementsHidden>
        <View style={[styles.dot, styles.dotLeft]} />
        <View style={[styles.dot, styles.dotRight]} />
        <Animated.View style={[styles.pill, { transform: [{ translateX: pillX }] }]} />
      </View>

      {hintVisible && (
        <View
          style={[styles.hint, { width: trackWidth / 2 }]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.hintCaret} />
          <View style={styles.hintBody}>
            <Text style={styles.hintText}>Swipe or tap for Chat</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: TRACK,
    flexDirection: 'row',
  },
  thumb: {
    position: 'absolute',
    left: INSET,
    top: INSET,
    height: TRACK_HEIGHT - INSET * 2,
    borderRadius: (TRACK_HEIGHT - INSET * 2) / 2,
    backgroundColor: THUMB,
    shadowColor: ON,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  half: {
    flex: 1,
    height: TRACK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13.5,
    letterSpacing: 1.8,
    paddingLeft: 1.8, // balances the trailing letter spacing so the word stays centred
  },
  newDot: {
    position: 'absolute',
    right: -11,
    top: -2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: NEW_DOT,
  },
  dots: {
    alignSelf: 'center',
    width: 26,
    height: 6,
    marginTop: 10,
  },
  dot: {
    position: 'absolute',
    top: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: DOT_IDLE,
  },
  dotLeft: { left: 0 },
  dotRight: { right: 0 },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: MOSS,
  },
  hint: {
    position: 'absolute',
    top: TRACK_HEIGHT + 12,
    right: 20,
    alignItems: 'center',
    zIndex: 5,
  },
  hintCaret: {
    width: 10,
    height: 10,
    backgroundColor: ON,
    transform: [{ rotate: '45deg' }],
    marginBottom: -5,
    borderRadius: 2,
  },
  hintBody: {
    backgroundColor: ON,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: ON,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  hintText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Medium',
    fontSize: 13.5,
  },
});
