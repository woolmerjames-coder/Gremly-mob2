/**
 * usePhase8LinksState - Hook to manage Phase 8 tags and people links
 * Used in overlay for create/edit flows
 */

import { useState, useEffect, useCallback } from 'react';
import type { Tag, EntityPerson, ItemType } from '../../../lib/repo/types';
import type { IRepo } from '../../../lib/repo/IRepo';

export interface Phase8LinksState {
  // Tags
  allTags: Tag[];
  currentTags: Tag[];
  loadTags: () => Promise<void>;
  addTag: (tagName: string) => Promise<Tag>;
  linkTag: (tagId: string) => Promise<void>;
  unlinkTag: (tagId: string) => Promise<void>;

  // People
  linkedPeople: EntityPerson[];
  loadPeople: () => Promise<void>;
  linkPerson: (personName: string, personEmail?: string) => Promise<EntityPerson>;
  unlinkPerson: (linkId: string) => Promise<void>;

  // Pending (for new items without ID)
  pendingTagIds: string[];
  pendingPeople: Array<{ personName: string; personEmail?: string }>;

  // State
  isLoading: boolean;
}

export function usePhase8LinksState(
  repo: IRepo,
  userId: string,
  itemId: string | null, // null for new items
  itemType: ItemType | null,
): Phase8LinksState {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [currentTags, setCurrentTags] = useState<Tag[]>([]);
  const [linkedPeople, setLinkedPeople] = useState<EntityPerson[]>([]);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [pendingPeople, setPendingPeople] = useState<
    Array<{ personName: string; personEmail?: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load all tags for typeahead - use Phase 8 method
  const loadTags = useCallback(async () => {
    try {
      // Call Phase 8 method which returns Phase 8 Tag type
      const tags = await (repo as any).listTags(); // Cast to any temporarily for Phase 8 methods
      setAllTags(tags as Tag[]);
    } catch (error) {
      console.error('[Phase8Links] Failed to load tags:', error);
    }
  }, [repo]);

  // Load item's current tags
  const loadItemTags = useCallback(async () => {
    if (!itemId || !itemType) return;

    try {
      const tags = await (repo as any).listItemTags(itemId);
      setCurrentTags(tags as Tag[]);
    } catch (error) {
      console.error('[Phase8Links] Failed to load item tags:', error);
    }
  }, [repo, itemId, itemType]);

  // Load item's linked people
  const loadPeople = useCallback(async () => {
    if (!itemId) return;

    try {
      const people = await (repo as any).listLinkedPeopleByItem(itemId);
      setLinkedPeople(people as EntityPerson[]);
    } catch (error) {
      console.error('[Phase8Links] Failed to load linked people:', error);
    }
  }, [repo, itemId]);

  // Add/link tag
  const addTag = useCallback(
    async (tagName: string): Promise<Tag> => {
      const tag = await (repo as any).upsertTag(tagName);

      // Update allTags if not already present
      if (!allTags.some((t) => t.id === tag.id)) {
        setAllTags((prev) => [...prev, tag as Tag]);
      }

      return tag as Tag;
    },
    [repo, allTags],
  );

  const linkTag = useCallback(
    async (tagId: string): Promise<void> => {
      if (itemId && itemType) {
        // Item exists - link immediately
        await (repo as any).linkTag({ itemId, tagId, itemType });
        await loadItemTags();
      } else {
        // New item - add to pending
        setPendingTagIds((prev) => [...prev, tagId]);
      }
    },
    [repo, itemId, itemType, loadItemTags],
  );

  const unlinkTag = useCallback(
    async (tagId: string): Promise<void> => {
      if (itemId) {
        // Item exists - unlink immediately
        await (repo as any).unlinkTag({ itemId, tagId });
        await loadItemTags();
      } else {
        // New item - remove from pending
        setPendingTagIds((prev) => prev.filter((id) => id !== tagId));
      }
    },
    [repo, itemId, loadItemTags],
  );

  const linkPerson = useCallback(
    async (personName: string, personEmail?: string): Promise<EntityPerson> => {
      if (itemId && itemType) {
        // Item exists - link immediately
        const person = await (repo as any).linkPerson({
          itemId,
          itemType,
          personName,
          personEmail,
        });
        await loadPeople();
        return person as EntityPerson;
      } else {
        // New item - add to pending
        const tempPerson: EntityPerson = {
          id: `temp-${Date.now()}`,
          user_id: userId,
          item_id: '',
          item_type: itemType || 'note',
          person_name: personName,
          person_email: personEmail || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setPendingPeople((prev) => [...prev, { personName, personEmail }]);
        return tempPerson;
      }
    },
    [repo, userId, itemId, itemType, loadPeople],
  );

  const unlinkPerson = useCallback(
    async (linkId: string): Promise<void> => {
      if (itemId) {
        // Item exists - unlink immediately
        await (repo as any).unlinkPerson(linkId);
        await loadPeople();
      } else {
        // New item - remove from pending (match by name)
        setPendingPeople((prev) => prev.filter((_, idx) => `temp-${idx}` !== linkId));
      }
    },
    [repo, itemId, loadPeople],
  );

  // Initial load
  useEffect(() => {
    if (!userId) return;

    let mounted = true;

    const loadInitialData = async () => {
      if (mounted) setIsLoading(true);

      try {
        await Promise.all([
          loadTags(),
          itemId && itemType ? loadItemTags() : Promise.resolve(),
          itemId ? loadPeople() : Promise.resolve(),
        ]);
      } catch (error) {
        console.error('[Phase8Links] Initial load failed:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadInitialData();

    return () => {
      mounted = false;
    };
  }, [userId, itemId, itemType, loadTags, loadItemTags, loadPeople]);

  return {
    allTags,
    currentTags,
    loadTags,
    addTag,
    linkTag,
    unlinkTag,
    linkedPeople,
    loadPeople,
    linkPerson,
    unlinkPerson,
    pendingTagIds,
    pendingPeople,
    isLoading,
  };
}
