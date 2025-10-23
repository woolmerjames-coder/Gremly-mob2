/**
 * Mascot Component - Phase 10.6
 *
 * Brand-aligned mascot with calm, minimal animations.
 * Supports Lottie animations with static fallbacks.
 * Respects feature flags and reduced motion preferences.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { MascotState } from '../../lib/types';
import { FLAG_MASCOT, FLAG_REDUCED } from '../../config/featureFlags';

interface MascotProps {
  state: MascotState;
  size?: number;
}

export function Mascot({ state, size = 64 }: MascotProps) {
  // Early return if mascot feature is disabled
  if (!FLAG_MASCOT) {
    return null;
  }

  // Use static fallback for reduced motion or when Lottie assets are missing
  if (FLAG_REDUCED) {
    return <StaticMascot state={state} size={size} />;
  }

  // For now, always use static fallback until Lottie is properly configured
  return <StaticMascot state={state} size={size} />;
}

/**
 * Lottie-based animated mascot
 * Attempts to load JSON animations from assets/mascot/
 * Currently commented out until Lottie integration is complete
 */
function LottieMascot({ state, size }: { state: MascotState; size: number }) {
  // Note: This will require lottie-react-native installation and asset setup
  // For now, we'll fall back to static until Lottie is installed and configured

  // Uncomment when lottie-react-native is installed and assets are available:
  // const LottieView = require('lottie-react-native').default;
  //
  // const animationSource = getLottieSource(state);
  // if (!animationSource) {
  //   return <StaticMascot state={state} size={size} />;
  // }
  //
  // return (
  //   <View style={[styles.container, { width: size, height: size }]}>
  //     <LottieView
  //       source={animationSource}
  //       autoPlay={true}
  //       loop={state === 'idle' || state === 'thinking' || state === 'rest'}
  //       style={styles.lottie}
  //     />
  //   </View>
  // );

  // Fallback to static for now
  return <StaticMascot state={state} size={size} />;
}

/**
 * Static mascot using simple shapes/emojis
 * Used for reduced motion or as Lottie fallback
 */
function StaticMascot({ state, size }: { state: MascotState; size: number }) {
  const emoji = getStaticEmoji(state);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.staticMascot, { width: size * 0.8, height: size * 0.8 }]}>
        <View style={styles.emojiContainer}>
          {/* Simple text-based mascot - can be replaced with SVG/PNG */}
          <Text style={[styles.emojiText, { fontSize: size * 0.4 }]}>{emoji}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Get emoji representation for each state
 */
function getStaticEmoji(state: MascotState): string {
  switch (state) {
    case 'idle':
      return '😌'; // Calm, peaceful
    case 'thinking':
      return '🤔'; // Thoughtful
    case 'replying':
      return '😊'; // Friendly response
    case 'playful':
      return '😉'; // Wink for chit-chat
    case 'celebration':
      return '🎉'; // Small celebration
    case 'rest':
      return '😴'; // Low motion/rest
    default:
      return '😌'; // Default to calm
  }
}

/**
 * Get Lottie animation source for state
 * Returns null if asset is missing
 * Currently unused - will be enabled when Lottie assets are added
 */
// function getLottieSource(state: MascotState) {
//   try {
//     switch (state) {
//       case 'idle':
//         return require('../../assets/mascot/idle.json');
//       case 'thinking':
//         return require('../../assets/mascot/thinking.json');
//       case 'replying':
//         return require('../../assets/mascot/replying.json');
//       case 'playful':
//         return require('../../assets/mascot/playful.json');
//       case 'celebration':
//         return require('../../assets/mascot/celebration.json');
//       case 'rest':
//         return require('../../assets/mascot/rest.json');
//       default:
//         return require('../../assets/mascot/idle.json');
//     }
//   } catch (error) {
//     // Asset not found, return null for fallback
//     return null;
//   }
// }

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  staticMascot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 249, 240, 0.3)', // Subtle cream background
    borderRadius: 999, // Fully rounded
  },
  emojiContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    textAlign: 'center',
  },
});
