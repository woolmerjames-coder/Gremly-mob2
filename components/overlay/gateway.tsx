import React from 'react';
import { env } from '../../lib/env';
import { UnifiedOverlayV2 } from './UnifiedOverlayV2';
import { UnifiedCreateOverlay } from './UnifiedCreateOverlay';
import type { UnifiedCreateOverlayProps } from './UnifiedCreateOverlay';

/**
 * Gateway component that exposes a single `OverlayComponent` export.
 * It selects the implementation based on the runtime feature flag
 * `env.features.overlayV2` so callers import a single surface.
 */
export function OverlayComponent(props: UnifiedCreateOverlayProps) {
  // Prefer the new V2 overlay when feature gate enabled
  if (env.features?.overlayV2) return <UnifiedOverlayV2 {...props} />;

  // Fall back to the current unified overlay
  return <UnifiedCreateOverlay {...props} />;
}

export default OverlayComponent;
