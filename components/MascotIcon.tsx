import { View, type ViewStyle } from 'react-native';
import MascotSvg from '../assets/mascot/mascot.ai.svg';

interface MascotIconProps {
  pose?: 'neutral' | 'think' | 'celebrate' | 'default';
  style?: ViewStyle;
  size?: number;
  accessibilityLabel?: string;
}

/**
 * MascotIcon - Static SVG mascot for empty states and success moments
 * Phase 6: Pure StyleSheet, no className
 *
 * Uses real SVG asset from assets/mascot/mascot.ai.svg
 * Future: pose prop can be used to swap different SVG assets
 */
export default function MascotIcon({
  pose = 'neutral', // Reserved for future use (different SVG assets)
  style,
  size = 96,
  accessibilityLabel = 'Gremly mascot',
}: MascotIconProps) {
  // In future we can map pose -> different SVG assets or layers
  // For now, we use the same mascot SVG for all poses
  // The pose parameter is kept for backward compatibility and future enhancements
  void pose; // Explicitly mark as intentionally unused

  return (
    <View style={style} accessibilityLabel={accessibilityLabel} accessible>
      <MascotSvg width={size} height={size} />
    </View>
  );
}
