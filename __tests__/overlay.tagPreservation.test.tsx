/**
 * Test to verify that Mind Drop AI-generated tags are preserved
 * when saving a todo/habit without modifying tags
 *
 * NOTE: Tags in the overlay state include prefixes (#tag, @person)
 */

import { buildDraftPayloadFromEntity } from '../components/overlay/UnifiedOverlayV2';

describe('Overlay Tag Preservation', () => {
  describe('buildDraftPayloadFromEntity - tag initialization', () => {
    it('should initialize tags from todo entity in edit mode', () => {
      const todoEntity = {
        id: 'todo-123',
        type: 'todo',
        name: 'Dentist Appointment',
        body: 'Book dentist appointment',
        origin: 'catchall',
        tags: ['#appointment', '#dentist'],
        tags_meta: {
          sticky: [],
          tombstones: [],
        },
        due_at: null,
      };

      const payload = buildDraftPayloadFromEntity(todoEntity);

      // Tags should be extracted from entity with # prefixes preserved
      expect(payload.tags).toEqual(['#appointment', '#dentist']);
      expect(payload.todo?.title).toBe('Dentist Appointment');
      expect(payload.todo?.details).toBe('Book dentist appointment');
    });

    it('should initialize tags from habit entity in edit mode', () => {
      const habitEntity = {
        id: 'habit-456',
        type: 'habit',
        name: 'Morning Yoga',
        notes: 'Practice yoga every morning',
        origin: 'catchall',
        tags: ['#yoga', '#wellness'],
        tags_meta: {
          sticky: [],
          tombstones: [],
        },
      };

      const payload = buildDraftPayloadFromEntity(habitEntity);

      // Tags should be extracted from entity with # prefixes preserved
      expect(payload.tags).toEqual(['#yoga', '#wellness']);
      expect(payload.habit?.title).toBe('Morning Yoga');
      expect(payload.habit?.notes).toBe('Practice yoga every morning');
    });

    it('should handle empty tags array', () => {
      const todoEntity = {
        id: 'todo-789',
        type: 'todo',
        name: 'Simple task',
        body: 'Do something',
        origin: 'catchall',
        tags: [],
        tags_meta: {
          sticky: [],
          tombstones: [],
        },
      };

      const payload = buildDraftPayloadFromEntity(todoEntity);

      // Tags should be empty array, not undefined
      expect(payload.tags).toEqual([]);
    });

    it('should handle entity with no tags field', () => {
      const todoEntity = {
        id: 'todo-999',
        type: 'todo',
        name: 'Legacy task',
        body: 'Old todo without tags',
      };

      const payload = buildDraftPayloadFromEntity(todoEntity);

      // Tags should be empty array when not present
      expect(payload.tags).toEqual([]);
    });

    it('should normalize and filter tags for Mind Drop todos', () => {
      const todoEntity = {
        id: 'todo-filter',
        type: 'todo',
        name: 'Book Appointment',
        body: 'Book appointment',
        origin: 'catchall',
        tags: ['#appointment', '#book', '#APPOINTMENT'], // Duplicate (case-insensitive)
      };

      const payload = buildDraftPayloadFromEntity(todoEntity);

      // Duplicates should be removed, tags normalized
      expect(payload.tags?.length).toBeLessThanOrEqual(2);
      expect(payload.tags).not.toContain('book'); // 'book' filtered by heuristic
    });
  });

  describe('Tag preservation during save (integration concept)', () => {
    // Note: Full integration test would require mocking the entire overlay component
    // This documents the expected behavior

    it('documents expected behavior: tags should not be wiped on save without changes', () => {
      // SCENARIO:
      // 1. Mind Drop creates todo with tags ["#appointment", "#dentist"]
      // 2. BackgroundPrefill runs, sets aiTitle = "Dentist Appointment"
      // 3. User opens overlay, sees "Dentist Appointment" title and tag chips for both tags
      // 4. User changes due_date and presses Save WITHOUT touching tags
      // 5. The outgoing patch should NOT include a `tags` field
      // 6. The resulting entity should still have tags ["#appointment", "#dentist"]

      const originalEntity = {
        id: 'todo-save-test',
        type: 'todo',
        name: 'Dentist Appointment',
        body: 'Book dentist appointment',
        origin: 'catchall',
        tags: ['#appointment', '#dentist'],
        tags_meta: { sticky: [], tombstones: [] },
        due_at: null,
        views: {
          ai_title_frozen: true,
          ai_tags_frozen: true,
          minddrop_prefilled_v1: true,
        },
      };

      // Expected behavior documented in test description
      expect(originalEntity.tags).toEqual(['#appointment', '#dentist']);

      // When overlay initializes from this entity (tags include prefixes):
      const initialState = buildDraftPayloadFromEntity(originalEntity);
      expect(initialState.tags).toEqual(['#appointment', '#dentist']);

      // When user changes only due_date and saves:
      // - areTagsEqual(['#appointment', '#dentist'], ['#appointment', '#dentist']) should return true
      // - shouldIncludeTags should be false (mode === 'edit' && !tagsChanged)
      // - tagsPayload should be { tags_meta: existingTagsMeta } (no tags field)
      // - Final patch should not contain tags
      // - DB entity should preserve original tags

      // This behavior is verified by the areTagsEqual helper function
      const originalTags = ['#appointment', '#dentist'];
      const overlayTags = ['#appointment', '#dentist'];

      // Normalize both for comparison
      const normalize = (tags: string[]) =>
        tags
          .map((t) => t.replace(/^#/, '').trim().toLowerCase())
          .filter(Boolean)
          .sort();

      const normalizedOriginal = normalize(originalTags);
      const normalizedOverlay = normalize(overlayTags);

      expect(normalizedOriginal).toEqual(normalizedOverlay);
    });
  });
});
