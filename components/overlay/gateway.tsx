import React from 'react';
import { env } from '../../lib/env';
import { UnifiedOverlayV2 } from './UnifiedOverlayV2';
import { UnifiedCreateOverlay } from './UnifiedCreateOverlay';
import { ManualAddOverlay } from '../ManualAddOverlay';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';

/** Single import surface for all screens */
export function OverlayComponent(props: UnifiedCreateOverlayProps) {
  if (env.feature.overlayV2) return <UnifiedOverlayV2 {...props} />;
  // fall back to current unified overlay if enabled
  if (process.env.EXPO_PUBLIC_UNIFIED_OVERLAY !== 'off') {
    return <UnifiedCreateOverlay {...props} />;
  }
  // legacy/manual fallback
  return <ManualAddOverlay {...(props as any)} />;
}
