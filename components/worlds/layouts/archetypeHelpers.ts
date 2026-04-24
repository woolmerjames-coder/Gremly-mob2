// components/worlds/layouts/archetypeHelpers.ts
//
// Pure helper functions shared across all archetype layout components.
// No hooks, no React — plain TypeScript utilities.

import { lightTokens } from '../../../design/tokens';
import type { SignalVelocityDelta } from '../../../lib/supabase/types';

export function capitalizeVelocity(delta: SignalVelocityDelta | null): string {
  switch (delta) {
    case 'growing':
      return 'Growing';
    case 'stable':
      return 'Steady';
    case 'declining':
      return 'Cooling';
    default:
      return 'Dormant';
  }
}

export function resolveProjectVelocityDotColor(delta: SignalVelocityDelta | null): string {
  switch (delta) {
    case 'growing':
      return lightTokens.colors.velocityDotGrowing;
    case 'stable':
      return lightTokens.colors.velocityDotSteady;
    case 'declining':
      return lightTokens.colors.velocityDotCooling;
    default:
      return lightTokens.colors.velocityDotDormant;
  }
}

export function resolveDomesticVelocityDotColor(delta: SignalVelocityDelta | null): string {
  // Domestic worlds always show warmGrey-family dots per mockup 05
  switch (delta) {
    case 'growing':
      return lightTokens.colors.velocityDotSteady;
    case 'stable':
      return lightTokens.colors.velocityDotSteady;
    case 'declining':
      return lightTokens.colors.velocityDotCooling;
    default:
      return lightTokens.colors.velocityDotDormant;
  }
}
