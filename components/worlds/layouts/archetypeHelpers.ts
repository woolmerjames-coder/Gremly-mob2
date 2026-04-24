// components/worlds/layouts/archetypeHelpers.ts
//
// Pure helper functions shared across all archetype layout components.
// No hooks, no React — plain TypeScript utilities.

import { lightTokens } from '../../../design/tokens';
import type { SignalVelocityDelta, World } from '../../../lib/supabase/types';

// ─── Pill colors ──────────────────────────────────────────────────────────────

export interface PillColors {
  bg: string;
  dot: string;
  text: string;
}

export function resolvePillColors(world: World): PillColors {
  switch (world.world_type) {
    case 'project':
      return {
        bg: lightTokens.colors.sageMist,
        dot:
          world.signal_velocity_delta === 'growing'
            ? lightTokens.colors.velocityDotGrowing
            : lightTokens.colors.velocityDotSteady,
        text: lightTokens.colors.mossGreen,
      };
    case 'domestic':
      return {
        bg: lightTokens.colors.chipDomesticBorder,
        dot: lightTokens.colors.warmGrey,
        text: lightTokens.colors.worldsInk,
      };
    case 'practice':
      return {
        bg: lightTokens.colors.sageMist,
        dot: lightTokens.colors.sageGreen,
        text: lightTokens.colors.mossGreen,
      };
    case 'relationship':
      return {
        bg: lightTokens.colors.chipRelationshipBorder,
        dot: lightTokens.colors.warmGrey,
        text: lightTokens.colors.worldsInk,
      };
    default:
      return {
        bg: lightTokens.colors.sageMist,
        dot: lightTokens.colors.warmGrey,
        text: lightTokens.colors.worldsInk,
      };
  }
}

// ─── Summary callout accents ──────────────────────────────────────────────────

export function resolveSummaryAccents(world: World): { accent: string; tintBg: string } {
  switch (world.world_type) {
    case 'project':
      return {
        accent: lightTokens.colors.mossGreen,
        tintBg: 'rgba(46,85,64,0.04)',
      };
    case 'practice':
      return {
        accent: lightTokens.colors.sageGreen,
        tintBg: 'rgba(151,175,143,0.06)',
      };
    case 'relationship':
      return {
        accent: lightTokens.colors.warmGrey,
        tintBg: 'rgba(122,118,101,0.04)',
      };
    case 'domestic':
      return {
        accent: lightTokens.colors.warmGrey,
        tintBg: 'rgba(122,118,101,0.04)',
      };
    default:
      return {
        accent: lightTokens.colors.warmGrey,
        tintBg: 'rgba(122,118,101,0.04)',
      };
  }
}

// ─── Mascot pose ──────────────────────────────────────────────────────────────

export type MascotPose = 'neutral' | 'think' | 'celebrate' | 'default';

/**
 * Pose mapping for the world hero mascot.
 *
 * project: 'think' — focused, intent.
 * practice: 'neutral' — calm, ongoing rhythm.
 * relationship: 'celebrate' — joyful, connection-oriented.
 * domestic: 'neutral' — calm daily life.
 */
export function resolveMascotPose(world: World): MascotPose {
  switch (world.world_type) {
    case 'project':
      return 'think';
    case 'practice':
      return 'neutral';
    case 'relationship':
      return 'celebrate';
    case 'domestic':
      return 'neutral';
    default:
      return 'neutral';
  }
}

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
