/**
 * Phase 8: Unit tests for Entity-People repository methods
 */

import { SupabaseRepo } from '../../lib/repo/supabase';
import type { EntityPerson } from '../../lib/repo/types';

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

describe('SupabaseRepo - Entity People (Phase 8)', () => {
  let repo: SupabaseRepo;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    repo = new SupabaseRepo(mockUserId);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase/client');
    mockFrom = supabase.from as jest.Mock;
    mockFrom.mockClear();
  });

  describe('listLinkedPeopleByItem', () => {
    it('should return people linked to an item', async () => {
      const itemId = 'habit-1';
      const mockPeople: EntityPerson[] = [
        {
          id: 'ep-1',
          owner_id: mockUserId, // 10R: was user_id
          person_id: 'person-1', // 10R: FK to people table
          entity_id: itemId, // 10R: was item_id
          entity_type: 'habit', // 10R: was item_type
          person_name: 'John Doe',
          person_email: 'john@example.com',
          created_at: '2025-10-19T00:00:00Z',
          updated_at: '2025-10-19T00:00:00Z',
        },
        {
          id: 'ep-2',
          owner_id: mockUserId, // 10R: was user_id
          person_id: 'person-2', // 10R: FK to people table
          entity_id: itemId, // 10R: was item_id
          entity_type: 'habit', // 10R: was item_type
          person_name: 'Jane Smith',
          person_email: null,
          created_at: '2025-10-19T00:00:00Z',
          updated_at: '2025-10-19T00:00:00Z',
        },
      ];

      const mockOrder = jest.fn().mockResolvedValue({
        data: mockPeople,
        error: null,
      });

      const mockEq2 = jest.fn().mockReturnValue({
        order: mockOrder,
      });

      const mockEq1 = jest.fn().mockReturnValue({
        eq: mockEq2,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq1,
      });

      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await repo.listLinkedPeopleByItem(itemId);

      expect(mockFrom).toHaveBeenCalledWith('entity_people');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq1).toHaveBeenCalledWith('owner_id', mockUserId);
      expect(mockEq2).toHaveBeenCalledWith('entity_id', itemId);
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(result).toEqual(mockPeople);
    });
  });

  describe('linkPerson', () => {
    it('should link a person to an item with name and email', async () => {
      const mockEntityPerson: EntityPerson = {
        id: 'ep-1',
        owner_id: mockUserId, // 10R: was user_id
        person_id: 'person-1', // 10R: FK to people table
        entity_id: 'habit-1', // 10R: was item_id
        entity_type: 'habit', // 10R: was item_type
        person_name: 'John Doe',
        person_email: 'john@example.com',
        created_at: '2025-10-19T00:00:00Z',
        updated_at: '2025-10-19T00:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValue({
        data: mockEntityPerson,
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await repo.linkPerson({
        itemId: 'habit-1',
        itemType: 'habit',
        personName: 'John Doe',
        personEmail: 'john@example.com',
      });

      // Should call both people and entity_people tables
      expect(mockFrom).toHaveBeenCalledWith('people');
      expect(mockFrom).toHaveBeenCalledWith('entity_people');

      // Check the entity_people link was created with correct schema
      const entityPeopleCall = mockInsert.mock.calls.find(
        (call: any) => call[0].entity_id && call[0].person_id,
      );
      expect(entityPeopleCall[0]).toEqual(
        expect.objectContaining({
          owner_id: mockUserId,
          entity_id: 'habit-1',
          entity_type: 'habit',
          person_id: expect.any(String),
        }),
      );
      expect(result).toEqual(mockEntityPerson);
    });

    it('should link a person to an item with only name', async () => {
      const mockEntityPerson: EntityPerson = {
        id: 'ep-1',
        owner_id: mockUserId, // 10R: was user_id
        person_id: 'person-2', // 10R: FK to people table
        entity_id: 'todo-1', // 10R: was item_id
        entity_type: 'todo', // 10R: was item_type
        person_name: 'Jane Smith',
        person_email: null,
        created_at: '2025-10-19T00:00:00Z',
        updated_at: '2025-10-19T00:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValue({
        data: mockEntityPerson,
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      mockFrom.mockReturnValue({ insert: mockInsert });

      const result = await repo.linkPerson({
        itemId: 'todo-1',
        itemType: 'todo',
        personName: 'Jane Smith',
      });

      // Should call entity_people table twice:
      // 1st call: insert into people table to create/get person
      // 2nd call: insert into entity_people table to link
      expect(mockFrom).toHaveBeenCalledWith('people');
      expect(mockFrom).toHaveBeenCalledWith('entity_people');

      // Check the entity_people link was created with correct schema
      const entityPeopleCall = mockInsert.mock.calls.find(
        (call: any) => call[0].entity_id && call[0].person_id,
      );
      expect(entityPeopleCall[0]).toEqual(
        expect.objectContaining({
          owner_id: mockUserId,
          entity_id: 'todo-1',
          entity_type: 'todo',
          person_id: expect.any(String), // person_id from the created person
        }),
      );

      expect(result).toEqual(mockEntityPerson);
    });
  });

  describe('unlinkPerson', () => {
    it('should unlink a person from an item', async () => {
      const mockEq2 = jest.fn().mockResolvedValue({
        error: null,
      });

      const mockEq1 = jest.fn().mockReturnValue({
        eq: mockEq2,
      });

      const mockDelete = jest.fn().mockReturnValue({
        eq: mockEq1,
      });

      mockFrom.mockReturnValue({ delete: mockDelete });

      await repo.unlinkPerson('ep-1');

      expect(mockFrom).toHaveBeenCalledWith('entity_people');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq1).toHaveBeenCalledWith('owner_id', mockUserId);
      expect(mockEq2).toHaveBeenCalledWith('id', 'ep-1');
    });
  });
});
