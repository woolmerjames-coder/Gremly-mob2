import React from 'react';
import { View } from 'react-native';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';

/**
 * UnifiedOverlayV2 (Phase 0 shell)
 * - Prop parity with V1 to avoid caller changes
 * - No UX yet; will render a simple container
 */
export function UnifiedOverlayV2(props: UnifiedCreateOverlayProps) {
  // Keep props wired so nothing breaks later
  const { visible, onClose } = props;
  if (!visible) return null;
  return <View /* placeholder; real UI lands in Phase 1+ */ />;
}
