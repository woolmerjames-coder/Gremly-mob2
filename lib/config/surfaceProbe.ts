/**
 * Surface Membership Probe
 *
 * Enables tracking of entity presence across different UI surfaces
 * (Today, Space, MindDrop, Sweep) for automated testing and debugging.
 *
 * When TEST_MODE is enabled and a probe entity ID is set, this will log
 * SURFACE_MEMBERSHIP events whenever the entity appears/disappears from a surface.
 */

import { isTestMode } from './testMode';
import { testLogger } from '../../src/utils/TestLogger';

// Module-level state for probe entity ID
let probeEntityId: string | null = null;

// Track last known presence per surface to avoid spam
const lastKnownPresence: Map<string, boolean> = new Map();

/**
 * Set the entity ID to probe across surfaces.
 * Call this after creating an entity in a test scenario.
 *
 * @param id - Entity ID to track, or null to stop probing
 */
export function setTestProbeEntityId(id: string | null): void {
  probeEntityId = id;
  // Clear presence cache when probe changes
  lastKnownPresence.clear();

  if (isTestMode() && id) {
    testLogger.step('probe_entity_set', { entityId: id });
  }
}

/**
 * Get the current probe entity ID
 */
export function getTestProbeEntityId(): string | null {
  return probeEntityId;
}

/**
 * Clear the probe entity ID and presence cache
 */
export function clearTestProbe(): void {
  probeEntityId = null;
  lastKnownPresence.clear();
}

/**
 * Probe membership of the tracked entity in a surface list.
 * Only logs when TEST_MODE is enabled and a probe entity is set.
 * Deduplicates logs - only fires when presence changes.
 *
 * @param surfaceName - Name of the surface (e.g., 'Today', 'RecentDrops', 'SpaceHome')
 * @param list - Array of entities with `id` property
 * @param meta - Optional additional metadata to include in the log
 */
export function probeMembership<T extends { id: string }>(
  surfaceName: string,
  list: T[],
  meta?: Record<string, unknown>,
): void {
  // Early exit if not in test mode or no probe set
  if (!isTestMode() || !probeEntityId) return;

  const present = list.some((item) => item.id === probeEntityId);
  const lastPresence = lastKnownPresence.get(surfaceName);

  // Only log if presence changed (or first check for this surface)
  if (lastPresence !== present) {
    lastKnownPresence.set(surfaceName, present);
    testLogger.surface(surfaceName, probeEntityId, present, meta);
  }
}

/**
 * Force log membership regardless of change detection.
 * Useful for initial state logging or debugging.
 */
export function forceLogMembership<T extends { id: string }>(
  surfaceName: string,
  list: T[],
  meta?: Record<string, unknown>,
): void {
  if (!isTestMode() || !probeEntityId) return;

  const present = list.some((item) => item.id === probeEntityId);
  lastKnownPresence.set(surfaceName, present);
  testLogger.surface(surfaceName, probeEntityId, present, meta);
}

/**
 * Get current probe status for debugging
 */
export function getProbeStatus(): {
  probeEntityId: string | null;
  surfaces: Record<string, boolean>;
} {
  return {
    probeEntityId,
    surfaces: Object.fromEntries(lastKnownPresence),
  };
}
