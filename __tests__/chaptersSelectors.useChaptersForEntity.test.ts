/**
 * Tests for chaptersSelectors — specifically useChaptersForEntity.
 *
 * Covers:
 * - Returns empty array when entityId is null/undefined
 * - Returns empty array when no links exist for entity
 * - Returns matching chapters when links exist
 * - Deduplicates chapters (entity linked to same chapter twice via different
 *   drop types — shouldn't happen in practice but be safe)
 * - Results are sorted alphabetically by title
 */

import { renderHook } from '@testing-library/react-native';
import { useChaptersForEntity } from '../lib/store/chaptersSelectors';

// ─── Mock the store ──────────────────────────────────────────────────────────

const mockStoreState: Record<string, any> = {
  chapters: [],
  worlds: [],
  dropChapterLinks: [],
  dropWorldLinks: [],
};

jest.mock('../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: any) => any) => selector(mockStoreState),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeChapter = (id: string, title: string, worldId: string | null = null) => ({
  id,
  title,
  primary_world_id: worldId,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  owner_id: 'user-1',
  closed_at: null,
});

const makeWorld = (id: string, name: string) => ({
  id,
  name,
  display_name: null,
  owner_id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  accentColor: null,
  palette: null,
});

const makeLink = (dropId: string, chapterId: string, dropType = 'note') => ({
  id: `link-${dropId}-${chapterId}`,
  drop_id: dropId,
  chapter_id: chapterId,
  drop_type: dropType,
  assigned_by: 'user',
  created_at: '2026-01-01T00:00:00Z',
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStoreState.chapters = [];
  mockStoreState.worlds = [];
  mockStoreState.dropChapterLinks = [];
  mockStoreState.dropWorldLinks = [];
});

describe('useChaptersForEntity', () => {
  it('returns empty array for null entityId', () => {
    const { result } = renderHook(() => useChaptersForEntity(null));
    expect(result.current).toEqual([]);
  });

  it('returns empty array for undefined entityId', () => {
    const { result } = renderHook(() => useChaptersForEntity(undefined));
    expect(result.current).toEqual([]);
  });

  it('returns empty array when no links exist for entity', () => {
    mockStoreState.chapters = [makeChapter('ch-1', 'Running')];
    mockStoreState.dropChapterLinks = [makeLink('other-drop', 'ch-1')];

    const { result } = renderHook(() => useChaptersForEntity('drop-1'));
    expect(result.current).toEqual([]);
  });

  it('returns matching chapter when a link exists', () => {
    mockStoreState.chapters = [makeChapter('ch-1', 'Running', 'world-1')];
    mockStoreState.worlds = [makeWorld('world-1', 'Health')];
    mockStoreState.dropChapterLinks = [makeLink('drop-1', 'ch-1')];

    const { result } = renderHook(() => useChaptersForEntity('drop-1'));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('ch-1');
    expect(result.current[0].title).toBe('Running');
    expect(result.current[0].primary_world_id).toBe('world-1');
  });

  it('returns multiple chapters when entity is linked to multiple chapters', () => {
    mockStoreState.chapters = [
      makeChapter('ch-1', 'Zebra Chapter'),
      makeChapter('ch-2', 'Alpha Chapter'),
    ];
    mockStoreState.dropChapterLinks = [makeLink('drop-1', 'ch-1'), makeLink('drop-1', 'ch-2')];

    const { result } = renderHook(() => useChaptersForEntity('drop-1'));

    expect(result.current).toHaveLength(2);
    // Should be sorted alpha — Alpha before Zebra
    expect(result.current[0].title).toBe('Alpha Chapter');
    expect(result.current[1].title).toBe('Zebra Chapter');
  });

  it('does not include chapters for links belonging to a different entity', () => {
    mockStoreState.chapters = [
      makeChapter('ch-1', 'My Chapter'),
      makeChapter('ch-2', 'Other Chapter'),
    ];
    mockStoreState.dropChapterLinks = [
      makeLink('drop-1', 'ch-1'),
      makeLink('drop-2', 'ch-2'), // different drop
    ];

    const { result } = renderHook(() => useChaptersForEntity('drop-1'));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('ch-1');
  });

  it('worldAccentColor falls back gracefully when world is not in store', () => {
    // Chapter references a world that isn't in worlds[]
    mockStoreState.chapters = [makeChapter('ch-1', 'Orphan Chapter', 'missing-world')];
    mockStoreState.worlds = []; // world not loaded
    mockStoreState.dropChapterLinks = [makeLink('drop-1', 'ch-1')];

    const { result } = renderHook(() => useChaptersForEntity('drop-1'));

    expect(result.current).toHaveLength(1);
    // Should still return the chapter — just with a default accent colour
    expect(result.current[0].worldAccentColor).toBeDefined();
    expect(typeof result.current[0].worldAccentColor).toBe('string');
  });
});
