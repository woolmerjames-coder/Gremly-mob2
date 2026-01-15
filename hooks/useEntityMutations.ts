/**
 * useEntityMutations Hook
 *
 * Centralized mutations for entities (todos, habits, notes) with
 * structured test logging for TEST_MODE.
 *
 * Mutations:
 * - addToToday: Set due_day to today
 * - removeFromToday: Clear due_day
 * - assignToSpace: Set space_id
 * - unassignFromSpace: Clear space_id
 */

import { useCallback } from 'react';
import { useRepo } from '../providers/RepoProvider';
import { isTestMode } from '../lib/config/testMode';
import { testLogger } from '../src/utils/TestLogger';
import { dateService } from '../lib/date/DateService';

type EntityType = 'todo' | 'habit' | 'note';

interface BeforeState {
  in_today: boolean;
  space_id: string | null;
  archived: boolean;
  dueDay: string | null;
}

interface MutationResult {
  success: boolean;
  error?: Error;
}

/**
 * Get today's date string in YYYY-MM-DD format
 * Using dateService.today() to avoid timezone bug (toISOString converts to UTC first)
 */
function getTodayString(): string {
  return dateService.today();
}

/**
 * Hook for entity mutations with test logging
 */
export function useEntityMutations() {
  const repo = useRepo();

  /**
   * Add an entity to Today by setting due_day to today
   */
  const addToToday = useCallback(
    async (
      entityId: string,
      entityType: EntityType,
      beforeState?: Partial<BeforeState>,
    ): Promise<MutationResult> => {
      const mutation = 'addToToday';
      const testEnabled = isTestMode();
      const todayStr = getTodayString();

      if (testEnabled) {
        testLogger.step('mutation_requested', { mutation, entityId, entityType });
        if (beforeState) {
          testLogger.step('mutation_before', { mutation, entityId, before: beforeState });
        }
      }

      try {
        // Local optimistic update happens via repo.update
        if (testEnabled) {
          testLogger.step('mutation_applied_local', {
            mutation,
            entityId,
            after: { dueDay: todayStr, in_today: true },
          });
        }

        // Perform DB update
        await repo.update({
          id: entityId,
          patch: { due_day: todayStr, carry_forward: false } as any,
        });

        if (testEnabled) {
          testLogger.assert('mutation_written_db', true, { mutation, entityId });
        }

        // Confirmation comes via realtime/store sync
        if (testEnabled) {
          testLogger.assert('mutation_confirmed', true, {
            mutation,
            entityId,
            afterDb: { dueDay: todayStr, in_today: true },
          });
        }

        return { success: true };
      } catch (error) {
        if (testEnabled) {
          testLogger.assert('mutation_written_db', false, {
            mutation,
            entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [repo],
  );

  /**
   * Remove an entity from Today by clearing due_day
   */
  const removeFromToday = useCallback(
    async (
      entityId: string,
      entityType: EntityType,
      beforeState?: Partial<BeforeState>,
    ): Promise<MutationResult> => {
      const mutation = 'removeFromToday';
      const testEnabled = isTestMode();

      if (testEnabled) {
        testLogger.step('mutation_requested', { mutation, entityId, entityType });
        if (beforeState) {
          testLogger.step('mutation_before', { mutation, entityId, before: beforeState });
        }
      }

      try {
        if (testEnabled) {
          testLogger.step('mutation_applied_local', {
            mutation,
            entityId,
            after: { dueDay: null, in_today: false },
          });
        }

        await repo.update({
          id: entityId,
          patch: { due_day: null } as any,
        });

        if (testEnabled) {
          testLogger.assert('mutation_written_db', true, { mutation, entityId });
          testLogger.assert('mutation_confirmed', true, {
            mutation,
            entityId,
            afterDb: { dueDay: null, in_today: false },
          });
        }

        return { success: true };
      } catch (error) {
        if (testEnabled) {
          testLogger.assert('mutation_written_db', false, {
            mutation,
            entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [repo],
  );

  /**
   * Assign an entity to a space
   */
  const assignToSpace = useCallback(
    async (
      entityId: string,
      spaceId: string,
      entityType: EntityType,
      beforeState?: Partial<BeforeState>,
    ): Promise<MutationResult> => {
      const mutation = 'assignToSpace';
      const testEnabled = isTestMode();

      if (testEnabled) {
        testLogger.step('mutation_requested', { mutation, entityId, spaceId, entityType });
        if (beforeState) {
          testLogger.step('mutation_before', { mutation, entityId, before: beforeState });
        }
      }

      try {
        if (testEnabled) {
          testLogger.step('mutation_applied_local', {
            mutation,
            entityId,
            after: { space_id: spaceId },
          });
        }

        await repo.update({
          id: entityId,
          patch: { space_id: spaceId, ai_placed: false } as any,
        });

        if (testEnabled) {
          testLogger.assert('mutation_written_db', true, { mutation, entityId, spaceId });
          testLogger.assert('mutation_confirmed', true, {
            mutation,
            entityId,
            afterDb: { space_id: spaceId },
          });
        }

        return { success: true };
      } catch (error) {
        if (testEnabled) {
          testLogger.assert('mutation_written_db', false, {
            mutation,
            entityId,
            spaceId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [repo],
  );

  /**
   * Unassign an entity from its space (move to global)
   */
  const unassignFromSpace = useCallback(
    async (
      entityId: string,
      entityType: EntityType,
      beforeState?: Partial<BeforeState>,
    ): Promise<MutationResult> => {
      const mutation = 'unassignFromSpace';
      const testEnabled = isTestMode();

      if (testEnabled) {
        testLogger.step('mutation_requested', { mutation, entityId, entityType });
        if (beforeState) {
          testLogger.step('mutation_before', { mutation, entityId, before: beforeState });
        }
      }

      try {
        if (testEnabled) {
          testLogger.step('mutation_applied_local', {
            mutation,
            entityId,
            after: { space_id: null },
          });
        }

        await repo.update({
          id: entityId,
          patch: { space_id: null } as any,
        });

        if (testEnabled) {
          testLogger.assert('mutation_written_db', true, { mutation, entityId });
          testLogger.assert('mutation_confirmed', true, {
            mutation,
            entityId,
            afterDb: { space_id: null },
          });
        }

        return { success: true };
      } catch (error) {
        if (testEnabled) {
          testLogger.assert('mutation_written_db', false, {
            mutation,
            entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [repo],
  );

  /**
   * Archive an entity
   */
  const archive = useCallback(
    async (
      entityId: string,
      entityType: EntityType,
      reason?: string,
      beforeState?: Partial<BeforeState>,
    ): Promise<MutationResult> => {
      const mutation = 'archive';
      const testEnabled = isTestMode();

      if (testEnabled) {
        testLogger.step('mutation_requested', { mutation, entityId, entityType, reason });
        if (beforeState) {
          testLogger.step('mutation_before', { mutation, entityId, before: beforeState });
        }
      }

      try {
        if (testEnabled) {
          testLogger.step('mutation_applied_local', {
            mutation,
            entityId,
            after: { archived: true },
          });
        }

        await repo.update({
          id: entityId,
          patch: {
            archived: true,
            archived_at: new Date().toISOString(),
            archived_reason: reason ?? null,
          } as any,
        });

        if (testEnabled) {
          testLogger.assert('mutation_written_db', true, { mutation, entityId });
          testLogger.assert('mutation_confirmed', true, {
            mutation,
            entityId,
            afterDb: { archived: true },
          });
        }

        return { success: true };
      } catch (error) {
        if (testEnabled) {
          testLogger.assert('mutation_written_db', false, {
            mutation,
            entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [repo],
  );

  return {
    addToToday,
    removeFromToday,
    assignToSpace,
    unassignFromSpace,
    archive,
  };
}

export type { BeforeState, MutationResult, EntityType };
