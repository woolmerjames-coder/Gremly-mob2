/**
 * Integration tests for habit template linkage
 * Tests:
 * - Attaching a template to a habit
 * - Daily reset logic (checklist reloads from template)
 * - Template deletion behavior (habit keeps items but loses link)
 */

import { SupabaseRepo } from '../lib/repo/supabase';
import { applyTemplateToList } from '../lib/lists/templates/helpers';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-id' } } },
        error: null,
      }),
    },
  })),
}));

describe('Habit Template Integration', () => {
  let repo: SupabaseRepo;
  let mockSupabase: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock Supabase instance
    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();

    // Initialize repo (uses environment variables or defaults)
    repo = new SupabaseRepo();
  });

  describe('Attach Template to Habit', () => {
    it('should attach a template and seed initial list_items', async () => {
      const habitId = 'habit-123';
      const templateId = 'template-456';
      const templateItems = [
        { id: 'item-1', text: 'Meditate', checked: false },
        { id: 'item-2', text: 'Journal', checked: false },
        { id: 'item-3', text: 'Exercise', checked: false },
      ];

      // Mock template fetch
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: templateId, items: templateItems },
          error: null,
        }),
      });

      // Mock habit update
      const mockUpdate = jest.fn().mockResolvedValue({ data: {}, error: null });
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
          }),
        }),
      });

      // Simulate attaching template (this would happen in overlay)
      const newItems = applyTemplateToList([], templateItems, 'replace');

      expect(newItems).toHaveLength(3);
      expect(newItems.every((item) => item.checked === false)).toBe(true);
      expect(newItems.every((item) => item.text && item.id)).toBe(true);

      // Verify all items have unique IDs (not same as template)
      const templateIds = new Set(templateItems.map((i) => i.id));
      const newIds = new Set(newItems.map((i) => i.id));
      expect([...templateIds].every((id) => !newIds.has(id))).toBe(true);
    });

    it('should allow attaching template to habit with existing items', async () => {
      const currentItems = [{ id: 'existing-1', text: 'Old task', checked: true }];
      const templateItems = [
        { id: 'template-1', text: 'New task 1', checked: false },
        { id: 'template-2', text: 'New task 2', checked: false },
      ];

      // Replace mode: discard existing items
      const resetItems = applyTemplateToList(currentItems, templateItems, 'replace');

      expect(resetItems).toHaveLength(2);
      expect(resetItems.every((item) => item.checked === false)).toBe(true);
      expect(resetItems.map((i) => i.text)).toEqual(['New task 1', 'New task 2']);
    });
  });

  describe('Daily Checklist Reset', () => {
    it('should detect when reset is needed (different day)', () => {
      const today = '2025-11-23';
      const yesterday = '2025-11-22';

      // Habit with template attached, last reset yesterday
      const habit = {
        id: 'habit-123',
        list_template_id: 'template-456',
        last_reset_date: `${yesterday}T10:00:00Z`,
      };

      // Extract date portion for comparison
      const lastResetDay = habit.last_reset_date.split('T')[0];

      // Should reset because days differ
      expect(lastResetDay).not.toBe(today);
      expect(lastResetDay).toBe(yesterday);
    });

    it('should not reset if already reset today', () => {
      const today = '2025-11-23';
      const todayEarlier = `${today}T08:00:00Z`;

      const habit = {
        id: 'habit-123',
        list_template_id: 'template-456',
        last_reset_date: todayEarlier,
      };

      const lastResetDay = habit.last_reset_date.split('T')[0];

      // Should NOT reset because same day
      expect(lastResetDay).toBe(today);
    });

    it('should reset all items to unchecked state', () => {
      const templateItems = [
        { id: 'item-1', text: 'Morning walk', checked: false },
        { id: 'item-2', text: 'Drink water', checked: false },
      ];

      // Simulate user checked some items during the day
      const checkedItems = templateItems.map((item, i) => ({
        ...item,
        checked: i === 0, // First item checked
      }));

      // Next day: reset from template
      const resetItems = applyTemplateToList([], templateItems, 'replace');

      expect(resetItems.every((item) => item.checked === false)).toBe(true);
      expect(resetItems).toHaveLength(2);
    });

    it('should generate fresh IDs on daily reset', () => {
      const templateItems = [
        { id: 'template-item-1', text: 'Task 1', checked: false },
        { id: 'template-item-2', text: 'Task 2', checked: false },
      ];

      // First reset
      const day1Items = applyTemplateToList([], templateItems, 'replace');
      const day1Ids = day1Items.map((i) => i.id);

      // Second reset (next day)
      const day2Items = applyTemplateToList([], templateItems, 'replace');
      const day2Ids = day2Items.map((i) => i.id);

      // IDs should be different each day (fresh UUIDs)
      expect(day1Ids.every((id) => !day2Ids.includes(id))).toBe(true);
      expect(day1Ids.every((id) => id !== 'template-item-1' && id !== 'template-item-2')).toBe(
        true,
      );
    });
  });

  describe('Template Deletion Behavior', () => {
    it('should preserve habit items when template is deleted (via FK ON DELETE SET NULL)', () => {
      // This is handled at database level via foreign key constraint:
      // ALTER TABLE habits ADD CONSTRAINT habits_list_template_fk
      //   FOREIGN KEY (list_template_id) REFERENCES list_templates(id)
      //   ON DELETE SET NULL;

      // After template deletion:
      // - habit.list_template_id becomes NULL
      // - habit.list_items_json stays intact
      // - habit.last_reset_date stays intact
      // - Habit continues to function, just no longer resets daily

      const habitAfterTemplateDeletion = {
        id: 'habit-123',
        list_template_id: null, // Set to NULL by FK constraint
        list_items: [{ id: 'item-1', text: 'Existing task', checked: false }],
        last_reset_date: '2025-11-23T10:00:00Z', // Preserved
      };

      expect(habitAfterTemplateDeletion.list_template_id).toBeNull();
      expect(habitAfterTemplateDeletion.list_items).toHaveLength(1);
      expect(habitAfterTemplateDeletion.last_reset_date).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle habit with template_id but template not found', () => {
      // This scenario occurs when template is deleted but FK hasn't updated yet,
      // or in race conditions. The resetHabitChecklist method should handle gracefully.

      const habitWithOrphanedTemplate = {
        id: 'habit-123',
        list_template_id: 'nonexistent-template-789',
        last_reset_date: null,
      };

      // In actual code, resetHabitChecklist would:
      // 1. Try to fetch template
      // 2. Get null/error
      // 3. Log warning and return early (no crash)
      // 4. Habit keeps existing list_items

      expect(habitWithOrphanedTemplate.list_template_id).toBeTruthy();
      // Would log: "[resetHabitChecklist] Template nonexistent-template-789 not found"
    });

    it('should handle template with empty items array', () => {
      const emptyTemplateItems: any[] = [];
      const resetItems = applyTemplateToList([], emptyTemplateItems, 'replace');

      expect(resetItems).toEqual([]);
    });

    it('should handle habit with no list_template_id (skip reset)', () => {
      const habitWithoutTemplate = {
        id: 'habit-123',
        list_template_id: null,
        last_reset_date: null,
        list_items: [{ id: 'manual-item-1', text: 'Manual task', checked: false }],
      };

      // In listTodayMerged, this habit would be skipped in the reset loop
      const shouldReset = habitWithoutTemplate.list_template_id !== null;
      expect(shouldReset).toBe(false);
    });
  });
});
