/**
 * FeatureFlaggedOverlay - Conditional overlay renderer
 *
 * Renders either UnifiedCreateOverlay (Phase 7) or ManualAddOverlay (Phase 6)
 * based on the EXPO_PUBLIC_UNIFIED_OVERLAY feature flag.
 *
 * This component provides a clean rollback path if issues arise with the unified overlay.
 *
 * Usage:
 *   <FeatureFlaggedOverlay
 *     visible={overlayController.state.visible}
 *     mode={overlayController.state.mode}
 *     initialEntity={overlayController.state.initialEntity}
 *     initialSpaceId={overlayController.state.initialSpaceId}
 *     onClose={overlayController.close}
 *     onSaved={handleOverlaySaved}
 *   />
 *
 * Feature Flag:
 *   EXPO_PUBLIC_UNIFIED_OVERLAY=true  → UnifiedCreateOverlay
 *   EXPO_PUBLIC_UNIFIED_OVERLAY=false → ManualAddOverlay (legacy)
 */

import React, { useCallback } from 'react';
import { UnifiedCreateOverlay } from './overlay/UnifiedCreateOverlay';
import { ManualAddOverlay } from '../legacy/overlays/ManualAddOverlay';
import { useRepo } from '../providers/RepoProvider';
import type { ManualAddPayload } from '../app/schemas/manualAdd';
import type { AppRecord, CanonicalType, LogSubtype } from '../lib/types';
import type { OverlaySavedPayload } from '../lib/events/overlaySaved';

type EntityType = CanonicalType;

interface FeatureFlaggedOverlayProps {
  visible: boolean;
  mode: 'create' | 'edit' | 'view';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  } | null;
  initialSpaceId?: string | null;
  onClose: () => void;
  onSaved?: (result: OverlaySavedPayload) => void;
}

export function FeatureFlaggedOverlay({
  visible,
  mode,
  initialEntity,
  initialSpaceId,
  onClose,
  onSaved,
}: FeatureFlaggedOverlayProps) {
  const useUnifiedOverlay =
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY === 'true' ||
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY === undefined; // Default to true

  if (useUnifiedOverlay) {
    // Phase 7: Use unified overlay
    return (
      <UnifiedCreateOverlay
        visible={visible}
        mode={mode === 'view' ? 'edit' : mode}
        initialEntity={initialEntity ?? undefined}
        initialSpaceId={initialSpaceId}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  } else {
    // Phase 6: Use legacy overlay
    return (
      <LegacyOverlayAdapter
        visible={visible}
        mode={mode}
        initialEntity={initialEntity}
        initialSpaceId={initialSpaceId}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
}

/**
 * Adapter component for legacy ManualAddOverlay
 * Converts unified overlay props to legacy overlay props
 */
function LegacyOverlayAdapter({
  visible,
  mode,
  initialEntity,
  initialSpaceId,
  onClose,
  onSaved,
}: FeatureFlaggedOverlayProps) {
  const repo = useRepo();

  const deriveDefaultTab = () => {
    if (initialEntity?.type === 'habit') return 'habits';
    if (initialEntity?.type === 'todo') return 'todos';
    if (initialEntity?.type === 'unsorted') return 'journal';
    if (initialEntity?.type === 'log') return 'journal';
    return 'habits';
  };

  const handleLegacySubmit = useCallback(
    async (payload: ManualAddPayload) => {
      try {
        // Convert legacy payload to unified create/update
        if (mode === 'create') {
          let result: AppRecord;

          switch (payload.type) {
            case 'habits':
              if (payload.subType === 'start') {
                result = await repo.create({
                  type: 'habit',
                  title: payload.data.name,
                  frequency:
                    payload.data.frequency === 'Daily'
                      ? 'daily'
                      : payload.data.frequency === 'Weekly'
                        ? 'weekly'
                        : 'monthly',
                  space_id: initialSpaceId,
                  ai_placed: false,
                });
              } else {
                result = await repo.create({
                  type: 'habit',
                  title: `Break: ${payload.data.name}`,
                  frequency: 'daily',
                  space_id: initialSpaceId,
                  ai_placed: false,
                });
              }
              onSaved?.({ type: 'habit', id: result.id });
              break;

            case 'todos':
              result = await repo.create({
                type: 'todo',
                title: payload.data.name,
                due_date: payload.data.deadline || null,
                undefined_due: !payload.data.deadline,
                space_id: initialSpaceId,
                ai_placed: false,
              });
              onSaved?.({ type: 'todo', id: result.id });
              break;

            case 'journal': {
              const journalEntry = payload.data.entry.trim();
              result = await repo.create({
                type: 'note',
                title: journalEntry || 'Journal entry',
                body: payload.data.entry,
                subtype: 'journal',
                space_id: initialSpaceId,
                ai_placed: false,
              });
              onSaved?.({ type: 'journal', id: result.id });
              break;
            }

            case 'catchall':
              console.log('[LegacyOverlayAdapter] Catchall handled by ManualAddOverlay');
              onSaved?.({ type: 'note', id: 'catchall-placeholder' });
              break;
          }
        }
      } catch (error) {
        console.error('[LegacyOverlayAdapter] Submit failed:', error);
      }
    },
    [mode, initialSpaceId, onSaved, repo],
  );

  // For edit mode, we'd need to fetch the record and populate initialValues
  // For now, legacy edit mode is not fully supported in this adapter
  const initialValues =
    mode === 'edit' && initialEntity?.id
      ? {} // Would need to fetch from repo
      : undefined;

  return (
    <ManualAddOverlay
      visible={visible}
      mode={mode === 'view' ? 'edit' : mode}
      defaultTab={deriveDefaultTab()}
      itemId={mode === 'edit' ? initialEntity?.id : undefined}
      initialValues={initialValues}
      onClose={onClose}
      onSubmit={handleLegacySubmit}
      onSaved={() =>
        onSaved?.({
          type:
            initialEntity?.type === 'log'
              ? initialEntity?.logSubtype === 'journal'
                ? 'journal'
                : 'note'
              : initialEntity?.type === 'unsorted'
                ? 'unsorted'
                : initialEntity?.type || 'habit',
          id: initialEntity?.id || '',
        })
      }
    />
  );
}
