/**
 * Phase 8: Unit tests for Tags repository methods
 */

import { SupabaseRepo } from '../../lib/repo/supabase';
import type { Tag, TagMap } from '../../lib/repo/types';

// Mock the Supabase client
jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

// Mock date-fns to avoid installation requirement in tests
jest.mock('date-fns', () => ({
  isToday: jest.fn(() => true),
  parseISO: jest.fn((str: string) => new Date(str)),
}));

const mockUserId = 'test-user-123';

describe('SupabaseRepo - Tags (Phase 8)', () => {
  let repo: SupabaseRepo;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    repo = new SupabaseRepo(mockUserId);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');
    mockFrom = supabase.from as jest.Mock;
    mockFrom.mockClear();
  });

  describe('listTags', () => {
    it('should return all tags for the user', async () => {
      const mockTags: Tag[] = [
        {
          id: 'tag-1',
          user_id: mockUserId,
          name: 'Work',
          created_at: '2025-10-19T00:00:00Z',
          updated_at: '2025-10-19T00:00:00Z',
        },
        {
          id: 'tag-2',
          user_id: mockUserId,
          name: 'Personal',
          created_at: '2025-10-19T00:00:00Z',
          updated_at: '2025-10-19T00:00:00Z',
        },
      ];

      const mockOrder = jest.fn().mockResolvedValue({
        data: mockTags,
        error: null,
      });

      const mockEq = jest.fn().mockReturnValue({
        order: mockOrder,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq,
      });

      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await repo.listTags();

      expect(mockFrom).toHaveBeenCalledWith('tags');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
      expect(result).toEqual(mockTags);
    });
  });

  describe('upsertTag', () => {
    it('should create a new tag', async () => {
      const newTag: Tag = {
        id: 'tag-1',
        user_id: mockUserId,
        name: 'Work',
        created_at: '2025-10-19T00:00:00Z',
        updated_at: '2025-10-19T00:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValue({
        data: newTag,
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await repo.upsertTag('Work');

      expect(mockFrom).toHaveBeenCalledWith('tags');
      expect(mockInsert).toHaveBeenCalledWith({ owner_id: mockUserId, name: 'Work' });
      expect(result).toEqual(newTag);
    });

    it('should return existing tag on unique constraint violation', async () => {
      const existingTag: Tag = {
        id: 'tag-1',
        user_id: mockUserId,
        name: 'Work',
        created_at: '2025-10-19T00:00:00Z',
        updated_at: '2025-10-19T00:00:00Z',
      };

      // First call: insert fails with unique constraint
      const mockInsertSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      const mockInsertSelect = jest.fn().mockReturnValue({
        single: mockInsertSingle,
      });

      const mockInsert = jest.fn().mockReturnValue({
        select: mockInsertSelect,
      });

      // Second call: select returns existing tag
      const mockSelectSingle = jest.fn().mockResolvedValue({
        data: existingTag,
        error: null,
      });

      const mockSelectEq2 = jest.fn().mockReturnValue({
        single: mockSelectSingle,
      });

      const mockSelectEq1 = jest.fn().mockReturnValue({
        eq: mockSelectEq2,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: mockSelectEq1,
      });

      mockFrom
        .mockReturnValueOnce({ insert: mockInsert })
        .mockReturnValueOnce({ select: mockSelect });

      const result = await repo.upsertTag('Work');

      expect(mockFrom).toHaveBeenCalledWith('tags');
      expect(result).toEqual(existingTag);
    });
  });

  describe('listItemTags', () => {
    it('should return tags linked to an item', async () => {
      const itemId = 'habit-1';
      const mockTag: Tag = {
        id: 'tag-1',
        user_id: mockUserId,
        name: 'Work',
        created_at: '2025-10-19T00:00:00Z',
        updated_at: '2025-10-19T00:00:00Z',
      };

      const mockEq2 = jest.fn().mockResolvedValue({
        data: [{ tag_id: 'tag-1', tags: mockTag }],
        error: null,
      });

      const mockEq1 = jest.fn().mockReturnValue({
        eq: mockEq2,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq1,
      });

      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await repo.listItemTags(itemId);

      expect(mockFrom).toHaveBeenCalledWith('tag_map');
      expect(mockSelect).toHaveBeenCalledWith('tag_id, tags(*)');
      expect(mockEq1).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockEq2).toHaveBeenCalledWith('item_id', itemId);
      expect(result).toEqual([mockTag]);
    });
  });

  describe('linkTag', () => {
    it('should link a tag to an item', async () => {
      const mockTagMap: TagMap = {
        id: 'map-1',
        user_id: mockUserId,
        item_id: 'habit-1',
        tag_id: 'tag-1',
        item_type: 'habit',
        created_at: '2025-10-19T00:00:00Z',
        updated_at: '2025-10-19T00:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValue({
        data: mockTagMap,
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await repo.linkTag({
        itemId: 'habit-1',
        tagId: 'tag-1',
        itemType: 'habit',
      });

      expect(mockFrom).toHaveBeenCalledWith('tag_map');
      expect(mockInsert).toHaveBeenCalledWith({
        owner_id: mockUserId,
        entity_id: 'habit-1',
        tag_id: 'tag-1',
        entity_type: 'habit',
      });
      expect(result).toEqual(mockTagMap);
    });
  });

  describe('unlinkTag', () => {
    it('should unlink a tag from an item', async () => {
      const mockEq3 = jest.fn().mockResolvedValue({
        error: null,
      });

      const mockEq2 = jest.fn().mockReturnValue({
        eq: mockEq3,
      });

      const mockEq1 = jest.fn().mockReturnValue({
        eq: mockEq2,
      });

      const mockDelete = jest.fn().mockReturnValue({
        eq: mockEq1,
      });

      mockFrom.mockReturnValue({ delete: mockDelete });

      await repo.unlinkTag({ itemId: 'habit-1', tagId: 'tag-1' });

      expect(mockFrom).toHaveBeenCalledWith('tag_map');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq1).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockEq2).toHaveBeenCalledWith('item_id', 'habit-1');
      expect(mockEq3).toHaveBeenCalledWith('tag_id', 'tag-1');
    });
  });
});
