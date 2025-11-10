import { useCallback } from 'react';
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';
import { SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../lib/repo/memory';
import type { SpaceChat } from '../lib/types';
import { normalizeSearchTagInput } from '../lib/tags/search';

export type SearchItem = {
  id: string;
  type: 'chat' | 'note' | 'habit';
  title: string;
  snippet?: string;
  dateLabel?: string;
};

export function useSpaceSearch(spaceId: string) {
  const repo = useRepo();
  const { userId } = useAuth();

  const search = useCallback(
    async (q: string, filter: 'chats' | 'notes' | 'habits'): Promise<SearchItem[]> => {
      const trimmed = q.trim();
      if (!trimmed) return [];

      const query = trimmed.toLowerCase();
      const isTagSearch = ['#', '*', '@'].includes(trimmed[0]);
      const tagToken = normalizeSearchTagInput(trimmed);
      const normalizedTagToken = tagToken.toLowerCase();
      const hasTag = (tags?: string[]) =>
        normalizedTagToken.length > 0 &&
        Array.isArray(tags) &&
        tags.map((t) => t.toLowerCase()).includes(normalizedTagToken);

      try {
        if (filter === 'chats') {
          // Search chats
          const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';
          const chatRepo =
            backend === 'supabase'
              ? new SupabaseSpaceChatRepo(userId || undefined)
              : new MemorySpaceChatRepo(userId || 'anonymous');

          const chats = await chatRepo.list(spaceId);
          return chats
            .filter((chat: SpaceChat) => {
              const titleMatch = (chat.title || '').toLowerCase().includes(query);
              const snippetMatch = (chat.last_message_snippet || '').toLowerCase().includes(query);
              return titleMatch || snippetMatch;
            })
            .map((chat: SpaceChat) => ({
              id: chat.id,
              type: 'chat' as const,
              title: chat.title || 'New Chat',
              snippet: chat.last_message_snippet || undefined,
              dateLabel: chat.updated_at
                ? new Date(chat.updated_at as unknown as string).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : undefined,
            }));
        } else if (filter === 'notes') {
          // Search notes
          const items = await repo.listBySpace(spaceId);
          return items
            .filter((item: any) => {
              if (item.type !== 'note') return false;
              if (isTagSearch) {
                return hasTag(item.tags);
              }
              const titleMatch = (item.title || '').toLowerCase().includes(query);
              const bodyMatch = (item.body || '').toLowerCase().includes(query);
              const tagMatch = hasTag(item.tags);
              return titleMatch || bodyMatch || tagMatch;
            })
            .map((item: any) => ({
              id: item.id,
              type: 'note' as const,
              title: item.title || 'Untitled Note',
              snippet: item.body
                ? item.body.slice(0, 60) + (item.body.length > 60 ? '...' : '')
                : undefined,
              dateLabel: item.date
                ? new Date(item.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : undefined,
            }));
        } else if (filter === 'habits') {
          // Search habits
          const items = await repo.listBySpace(spaceId);
          return items
            .filter((item: any) => {
              if (item.type !== 'habit') return false;
              if (isTagSearch) {
                return hasTag(item.tags);
              }
              const titleMatch = (item.title || item.name || '').toLowerCase().includes(query);
              const tagMatch = hasTag(item.tags);
              return titleMatch || tagMatch;
            })
            .map((item: any) => ({
              id: item.id,
              type: 'habit' as const,
              title: item.title || item.name || 'Untitled Habit',
              snippet: undefined,
              dateLabel: undefined,
            }));
        }

        return [];
      } catch (error) {
        console.error('[useSpaceSearch] search failed:', error);
        return [];
      }
    },
    [spaceId, repo, userId],
  );

  const recent = useCallback(async (): Promise<SearchItem[]> => {
    // Optional: return last 5 items from this space
    try {
      const items = await repo.listBySpace(spaceId);
      return items.slice(0, 5).map((item: any) => ({
        id: item.id,
        type: item.type === 'note' ? ('note' as const) : ('habit' as const),
        title: item.title || item.name || 'Untitled',
        snippet: undefined,
        dateLabel: undefined,
      }));
    } catch (error) {
      console.error('[useSpaceSearch] recent failed:', error);
      return [];
    }
  }, [spaceId, repo]);

  return { search, recent };
}
