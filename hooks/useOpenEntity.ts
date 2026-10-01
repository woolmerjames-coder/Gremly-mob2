/**
 * useOpenEntity: one tap on an entity card opens the item it shows.
 *
 * Todos and notes open in the app-wide edit overlay (the same one the Hub and
 * Today use); habits have their own detail screen. The card carries only the
 * item's id and type, so the store's record is passed when it is loaded and
 * the overlay looks the item up otherwise, as the locked item cards do.
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useUnifiedOverlayController } from './useUnifiedOverlayController';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import type { EntityCardEntity } from '../lib/types';

export function useOpenEntity(): (entity: EntityCardEntity) => void {
  const overlayController = useUnifiedOverlayController();
  const navigation = useNavigation<any>();
  return useCallback(
    (entity: EntityCardEntity) => {
      if (entity.type === 'habit') {
        navigation.navigate('HabitDetail', { habitId: entity.id });
        return;
      }
      const state = useGremlyStore.getState();
      const record =
        entity.type === 'todo'
          ? state.todos.find((t) => t.id === entity.id)
          : state.notes.find((n) => n.id === entity.id);
      overlayController.openEdit({
        record: { ...(record ?? { id: entity.id }), type: entity.type } as any,
        spaceId: entity.space_id ?? undefined,
      });
    },
    [overlayController, navigation],
  );
}
