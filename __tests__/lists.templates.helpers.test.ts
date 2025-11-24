/**
 * __tests__/lists.templates.helpers.test.ts
 *
 * Phase 4: List Templates - Helper function tests
 *
 * Tests for:
 * - buildTemplateFromList: Template creation from existing lists
 * - applyTemplateToList: Template application (replace/merge modes)
 */

import { describe, it, expect } from '@jest/globals';
import { buildTemplateFromList, applyTemplateToList } from '../lib/lists/templates/helpers';
import type { ListItem } from '../lib/types';

describe('List Template Helpers', () => {
  describe('buildTemplateFromList', () => {
    it('should create a template from list items', () => {
      const items: ListItem[] = [
        { id: 'item-1', text: 'Milk', checked: false },
        { id: 'item-2', text: 'Bread', checked: true },
        { id: 'item-3', text: 'Eggs', checked: false },
      ];

      const template = buildTemplateFromList({
        name: 'Grocery List',
        items,
        scope: 'any',
      });

      expect(template.name).toBe('Grocery List');
      expect(template.scope).toBe('any');
      expect(template.items).toEqual(items);
      expect(template.source_entity_type).toBeNull();
      expect(template.source_entity_id).toBeNull();
    });

    it('should include source entity metadata when provided', () => {
      const items: ListItem[] = [
        { id: 'item-1', text: 'Morning run', checked: false },
        { id: 'item-2', text: 'Stretch', checked: false },
      ];

      const template = buildTemplateFromList({
        name: 'Workout Routine',
        items,
        scope: 'habit',
        sourceEntityType: 'habit',
        sourceEntityId: 'habit-123',
      });

      expect(template.name).toBe('Workout Routine');
      expect(template.scope).toBe('habit');
      expect(template.source_entity_type).toBe('habit');
      expect(template.source_entity_id).toBe('habit-123');
    });

    it('should create todo-scoped template', () => {
      const items: ListItem[] = [
        { id: 'item-1', text: 'Review PR', checked: false },
        { id: 'item-2', text: 'Write tests', checked: false },
      ];

      const template = buildTemplateFromList({
        name: 'Code Review Checklist',
        items,
        scope: 'todo',
      });

      expect(template.scope).toBe('todo');
    });

    it('should create note-scoped template', () => {
      const items: ListItem[] = [
        { id: 'item-1', text: 'Passport', checked: false },
        { id: 'item-2', text: 'Tickets', checked: false },
      ];

      const template = buildTemplateFromList({
        name: 'Travel Packing',
        items,
        scope: 'note',
        sourceEntityType: 'note',
        sourceEntityId: 'note-456',
      });

      expect(template.scope).toBe('note');
      expect(template.source_entity_type).toBe('note');
    });

    it('should handle empty items array', () => {
      const template = buildTemplateFromList({
        name: 'Empty Template',
        items: [],
        scope: 'any',
      });

      expect(template.items).toEqual([]);
    });
  });

  describe('applyTemplateToList - Replace Mode', () => {
    it('should replace all items with template items', () => {
      const currentItems: ListItem[] = [
        { id: 'current-1', text: 'Old item 1', checked: true },
        { id: 'current-2', text: 'Old item 2', checked: false },
      ];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'New item 1', checked: true },
        { id: 'template-2', text: 'New item 2', checked: true },
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'replace');

      // Should have same count as template
      expect(result).toHaveLength(2);

      // Should have template text
      expect(result[0].text).toBe('New item 1');
      expect(result[1].text).toBe('New item 2');

      // Should have fresh IDs (not reuse template IDs)
      expect(result[0].id).not.toBe('template-1');
      expect(result[1].id).not.toBe('template-2');

      // Should reset checked to false
      expect(result[0].checked).toBe(false);
      expect(result[1].checked).toBe(false);

      // IDs should be UUIDs
      expect(result[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result[1].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should replace null current items with template items', () => {
      const templateItems: ListItem[] = [{ id: 'template-1', text: 'Item 1', checked: false }];

      const result = applyTemplateToList(null, templateItems, 'replace');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Item 1');
      expect(result[0].checked).toBe(false);
    });

    it('should replace undefined current items with template items', () => {
      const templateItems: ListItem[] = [{ id: 'template-1', text: 'Item 1', checked: false }];

      const result = applyTemplateToList(undefined, templateItems, 'replace');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Item 1');
    });

    it('should handle empty template in replace mode', () => {
      const currentItems: ListItem[] = [{ id: 'current-1', text: 'Item 1', checked: true }];

      const result = applyTemplateToList(currentItems, [], 'replace');

      expect(result).toEqual([]);
    });

    it('should generate unique IDs for each template item', () => {
      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'Item 1', checked: false },
        { id: 'template-2', text: 'Item 2', checked: false },
        { id: 'template-3', text: 'Item 3', checked: false },
      ];

      const result = applyTemplateToList(null, templateItems, 'replace');

      // All IDs should be unique
      const ids = result.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);

      // None should match template IDs
      expect(ids).not.toContain('template-1');
      expect(ids).not.toContain('template-2');
      expect(ids).not.toContain('template-3');
    });
  });

  describe('applyTemplateToList - Merge Mode', () => {
    it('should keep current items and append new template items', () => {
      const currentItems: ListItem[] = [{ id: 'current-1', text: 'Existing item', checked: true }];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'New item from template', checked: false },
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      expect(result).toHaveLength(2);

      // First item should be unchanged (kept from current)
      expect(result[0]).toEqual(currentItems[0]);

      // Second item should be from template with fresh ID and checked=false
      expect(result[1].text).toBe('New item from template');
      expect(result[1].checked).toBe(false);
      expect(result[1].id).not.toBe('template-1');
    });

    it('should deduplicate items by text (case-insensitive)', () => {
      const currentItems: ListItem[] = [
        { id: 'current-1', text: 'Milk', checked: false },
        { id: 'current-2', text: 'Bread', checked: true },
      ];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'milk', checked: false }, // Duplicate (case diff)
        { id: 'template-2', text: 'BREAD', checked: false }, // Duplicate (case diff)
        { id: 'template-3', text: 'Eggs', checked: false }, // New item
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      // Should only add Eggs (milk and bread are duplicates)
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Milk');
      expect(result[1].text).toBe('Bread');
      expect(result[2].text).toBe('Eggs');
    });

    it('should trim whitespace when deduplicating', () => {
      const currentItems: ListItem[] = [{ id: 'current-1', text: 'Item 1', checked: false }];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: '  Item 1  ', checked: false }, // Duplicate with whitespace
        { id: 'template-2', text: 'Item 2', checked: false }, // New item
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      // Should only add Item 2
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Item 1');
      expect(result[1].text).toBe('Item 2');
    });

    it('should handle null current items in merge mode', () => {
      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'Item 1', checked: false },
        { id: 'template-2', text: 'Item 2', checked: false },
      ];

      const result = applyTemplateToList(null, templateItems, 'merge');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Item 1');
      expect(result[1].text).toBe('Item 2');
    });

    it('should handle undefined current items in merge mode', () => {
      const templateItems: ListItem[] = [{ id: 'template-1', text: 'Item 1', checked: false }];

      const result = applyTemplateToList(undefined, templateItems, 'merge');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Item 1');
    });

    it('should preserve current item state (checked, id) in merge mode', () => {
      const currentItems: ListItem[] = [
        { id: 'keep-this-id', text: 'Keep this', checked: true },
        { id: 'another-id', text: 'And this', checked: false },
      ];

      const templateItems: ListItem[] = [{ id: 'template-1', text: 'New item', checked: true }];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      // First two items should be completely unchanged
      expect(result[0]).toEqual({
        id: 'keep-this-id',
        text: 'Keep this',
        checked: true,
      });
      expect(result[1]).toEqual({
        id: 'another-id',
        text: 'And this',
        checked: false,
      });

      // Third item from template should have fresh ID and checked=false
      expect(result[2].text).toBe('New item');
      expect(result[2].checked).toBe(false);
      expect(result[2].id).not.toBe('template-1');
    });

    it('should handle empty template in merge mode', () => {
      const currentItems: ListItem[] = [{ id: 'current-1', text: 'Item 1', checked: true }];

      const result = applyTemplateToList(currentItems, [], 'merge');

      // Should just return current items unchanged
      expect(result).toEqual(currentItems);
    });

    it('should handle all template items being duplicates', () => {
      const currentItems: ListItem[] = [
        { id: 'current-1', text: 'Item 1', checked: false },
        { id: 'current-2', text: 'Item 2', checked: false },
      ];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'Item 1', checked: false },
        { id: 'template-2', text: 'Item 2', checked: false },
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      // Should return only current items (no additions)
      expect(result).toEqual(currentItems);
    });

    it('should generate unique IDs for merged template items', () => {
      const currentItems: ListItem[] = [{ id: 'current-1', text: 'Existing', checked: false }];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'New 1', checked: false },
        { id: 'template-2', text: 'New 2', checked: false },
        { id: 'template-3', text: 'New 3', checked: false },
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      expect(result).toHaveLength(4);

      // All new item IDs should be unique
      const newItemIds = result.slice(1).map((item) => item.id);
      const uniqueIds = new Set(newItemIds);
      expect(uniqueIds.size).toBe(3);

      // None should match template IDs
      expect(newItemIds).not.toContain('template-1');
      expect(newItemIds).not.toContain('template-2');
      expect(newItemIds).not.toContain('template-3');
    });
  });

  describe('applyTemplateToList - Edge Cases', () => {
    it('should handle both empty current and template', () => {
      const result = applyTemplateToList([], [], 'merge');
      expect(result).toEqual([]);
    });

    it('should handle special characters in text', () => {
      const currentItems: ListItem[] = [
        { id: 'current-1', text: 'Item with "quotes"', checked: false },
      ];

      const templateItems: ListItem[] = [
        { id: 'template-1', text: 'Item with "quotes"', checked: false }, // Duplicate
        { id: 'template-2', text: "Item with 'apostrophes'", checked: false }, // New
      ];

      const result = applyTemplateToList(currentItems, templateItems, 'merge');

      expect(result).toHaveLength(2);
      expect(result[1].text).toBe("Item with 'apostrophes'");
    });

    it('should handle very long text strings', () => {
      const longText = 'A'.repeat(1000);

      const templateItems: ListItem[] = [{ id: 'template-1', text: longText, checked: false }];

      const result = applyTemplateToList(null, templateItems, 'replace');

      expect(result[0].text).toBe(longText);
      expect(result[0].text).toHaveLength(1000);
    });

    it('should preserve text exactly (no trimming of actual content)', () => {
      const templateItems: ListItem[] = [
        { id: 'template-1', text: '  Intentional spaces  ', checked: false },
      ];

      const result = applyTemplateToList(null, templateItems, 'replace');

      // Text should be preserved exactly as-is in the result
      expect(result[0].text).toBe('  Intentional spaces  ');
    });
  });
});
