/**
 * QARunner - Minimal dev-only QA test case runner for Gremly
 *
 * Helps run manual test cases by logging start/end and capturing
 * entity:created events from the MindDrop event bus.
 *
 * All behavior is guarded behind __DEV__ - dead code in production.
 */

import { testLogger } from '../utils/TestLogger';

interface QARunnerState {
  activeCase: string | null;
  waitingForEntity: boolean;
  lastEntityId: string | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

interface EntityCreatedPayload {
  entityId: string;
  dropId?: string;
  type?: string;
  [key: string]: unknown;
}

type LogMeta = Record<string, unknown>;

const ENTITY_TIMEOUT_MS = 15_000;

const state: QARunnerState = {
  activeCase: null,
  waitingForEntity: false,
  lastEntityId: null,
  timeoutId: null,
};

/**
 * Clear the entity timeout if one exists
 */
function clearEntityTimeout(): void {
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
}

/**
 * Reset all internal state
 */
function resetState(): void {
  clearEntityTimeout();
  state.activeCase = null;
  state.waitingForEntity = false;
  state.lastEntityId = null;
}

/**
 * Start a new QA test case
 *
 * @param caseName - Name of the test case
 * @param meta - Optional metadata to include in the start log
 */
function startCase(caseName: string, meta?: LogMeta): void {
  if (!__DEV__) return;

  // If there's already an active case, end it first
  if (state.activeCase) {
    testLogger.assert('previous_case_ended_cleanly', false, {
      previousCase: state.activeCase,
      newCase: caseName,
    });
    testLogger.end(false, { reason: 'interrupted_by_new_case' });
    resetState();
  }

  // Start the new case
  testLogger.start(caseName, meta);
  state.activeCase = caseName;
  state.waitingForEntity = true;
  state.lastEntityId = null;

  // Set up timeout for entity creation
  state.timeoutId = setTimeout(() => {
    if (state.activeCase && state.waitingForEntity) {
      testLogger.assert('entity_created_within_timeout', false, {
        timeoutMs: ENTITY_TIMEOUT_MS,
      });
      testLogger.end(false, {
        reason: 'entity_timeout',
        lastEntityId: state.lastEntityId,
      });
      resetState();
    }
  }, ENTITY_TIMEOUT_MS);
}

/**
 * Capture an entity:created event
 *
 * Call this when entity:created fires from the MindDrop event bus.
 *
 * @param payload - The entity:created event payload
 */
function captureEntityCreated(payload: EntityCreatedPayload): void {
  if (!__DEV__) return;

  // No active case, ignore
  if (!state.activeCase) return;

  const { entityId, dropId, type } = payload;

  // Log the step
  testLogger.step('entity:created', {
    entityId,
    dropId,
    type,
  });

  // Store the entity ID
  state.lastEntityId = entityId;

  // Clear the timeout since we got an entity
  clearEntityTimeout();
  state.waitingForEntity = false;
}

/**
 * End the current QA test case
 *
 * @param ok - Whether the test passed
 * @param meta - Optional metadata to include in the end log
 */
function endCase(ok: boolean, meta?: LogMeta): void {
  if (!__DEV__) return;

  // No active case, ignore
  if (!state.activeCase) return;

  testLogger.end(ok, {
    ...meta,
    lastEntityId: state.lastEntityId,
  });

  resetState();
}

/**
 * Check if a QA case is currently active
 */
function isActive(): boolean {
  if (!__DEV__) return false;
  return state.activeCase !== null;
}

/**
 * Get the current case name
 */
function getCurrentCase(): string | null {
  if (!__DEV__) return null;
  return state.activeCase;
}

/**
 * Get the last captured entity ID
 */
function getLastEntityId(): string | null {
  if (!__DEV__) return null;
  return state.lastEntityId;
}

export const QARunner = {
  startCase,
  captureEntityCreated,
  endCase,
  isActive,
  getCurrentCase,
  getLastEntityId,
};

export type { EntityCreatedPayload, LogMeta };
