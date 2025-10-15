import React from 'react';
import { View } from 'react-native';
import MascotSvg from '../assets/mascot/mascot.ai.svg';

interface MascotIconProps {
  pose?: 'neutral' | 'think' | 'celebrate' | 'default';
  className?: string;
  size?: number;
  accessibilityLabel?: string;
}

/**
 * MascotIcon - Static SVG mascot for empty states and success moments
 * Phase 5: Static only, no animations (respects reduced motion)
 *
 * Uses real SVG asset from assets/mascot/mascot.ai.svg
 * Future: pose prop can be used to swap different SVG assets
 */
export default function MascotIcon({
  pose = 'neutral', // Reserved for future use (different SVG assets)
  className,
  size = 96,
  accessibilityLabel = 'Gremly mascot',
}: MascotIconProps) {
  // In future we can map pose -> different assets or layers
  // For now, we use the same mascot SVG for all poses
  // The pose parameter is kept for backward compatibility and future enhancements
  void pose; // Explicitly mark as intentionally unused

  return (
    <View className={className} accessibilityLabel={accessibilityLabel} accessible>
      <MascotSvg width={size} height={size} />
    </View>
  );
}
