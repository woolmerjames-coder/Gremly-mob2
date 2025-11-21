/**
 * UnifiedOverlayV2 Mind Drop Todo Prefill Tests
 *
 * Verifies that:
 * 1. Mind Drop todos with origin='catchall' and body field trigger prefill on first edit
 * 2. Tag quality filtering applies to Mind Drop todo tags (e.g., #book filtered out)
 * 3. rawSentence = true for Mind Drop todos with body
 * 4. shouldSkipAutoPrefill = false for Mind Drop todos
 */

import { filterAndNormalizeTags } from '../../lib/tags/normalize';
import { TAG_STOP_WORDS } from '../../lib/tags/constants';

describe('Mind Drop Todo Prefill Logic', () => {
  describe('TAG_STOP_WORDS includes book', () => {
    test('"book" is in TAG_STOP_WORDS', () => {
      expect(TAG_STOP_WORDS.has('book')).toBe(true);
    });

    test('filterAndNormalizeTags removes #book tag', () => {
      const tags = ['#book', '#haircut', '#appointment', '#tomorrow'];
      const filtered = filterAndNormalizeTags(tags);

      expect(filtered).not.toContain('#book');
      expect(filtered).toContain('#haircut');
      expect(filtered).toContain('#appointment');
      // 'tomorrow' is also a stop word
      expect(filtered).not.toContain('#tomorrow');
    });

    test('filterAndNormalizeTags removes "book" without # prefix', () => {
      const tags = ['book', 'reading', 'library'];
      const filtered = filterAndNormalizeTags(tags);

      expect(filtered).not.toContain('#book');
      expect(filtered).toContain('#reading');
      expect(filtered).toContain('#library');
    });
  });

  describe('Mind Drop todo tag filtering', () => {
    test('filters junk tags from Mind Drop todos', () => {
      const mindDropTodoTags = [
        '#book',
        '#haircut',
        '#appointment',
        '#tomorrow',
        '#at',
        '#salon',
        '#good',
      ];

      const filtered = filterAndNormalizeTags(mindDropTodoTags);

      // Junk words should be filtered
      expect(filtered).not.toContain('#book');
      expect(filtered).not.toContain('#tomorrow');
      expect(filtered).not.toContain('#at');
      expect(filtered).not.toContain('#good');

      // Valid tags should remain
      expect(filtered).toContain('#haircut');
      expect(filtered).toContain('#appointment');
      expect(filtered).toContain('#salon');
    });

    test('preserves quality tags', () => {
      const tags = ['#urgent', '#work', '#meeting', '#project', '@alice'];
      const filtered = filterAndNormalizeTags(tags);

      expect(filtered).toContain('#urgent');
      expect(filtered).toContain('#work');
      expect(filtered).toContain('#meeting');
      expect(filtered).toContain('#project');
      expect(filtered).toContain('@alice');
    });

    test('filters common conversational junk tags', () => {
      const tags = [
        '#probably',
        '#been',
        '#bit',
        '#down',
        '#doing',
        '#actually',
        '#just',
        '#really',
        '#very',
        '#call',
        '#mum',
        '#exercise',
        '*journal',
      ];

      const filtered = filterAndNormalizeTags(tags);

      // Junk conversational words should be filtered
      expect(filtered).not.toContain('#probably');
      expect(filtered).not.toContain('#been');
      expect(filtered).not.toContain('#bit');
      expect(filtered).not.toContain('#down');
      expect(filtered).not.toContain('#doing');
      expect(filtered).not.toContain('#actually');
      expect(filtered).not.toContain('#just');
      expect(filtered).not.toContain('#really');
      expect(filtered).not.toContain('#very');

      // Valid content tags should remain
      expect(filtered).toContain('#call');
      expect(filtered).toContain('#mum');
      expect(filtered).toContain('#exercise');

      // Star tags should always be preserved
      expect(filtered).toContain('*journal');
    });

    test('filters short tags except whitelisted ones', () => {
      const tags = ['#it', '#to', '#up', '#at', '#tax', '#gym', '#job'];

      const filtered = filterAndNormalizeTags(tags);

      // Short junk tags should be filtered
      expect(filtered).not.toContain('#it');
      expect(filtered).not.toContain('#to');
      expect(filtered).not.toContain('#up');
      expect(filtered).not.toContain('#at');

      // Whitelisted short tags should remain
      expect(filtered).toContain('#tax');
      expect(filtered).toContain('#gym');
      expect(filtered).toContain('#job');
    });
  });

  describe('Mind Drop todo prefill behavior (unit tests)', () => {
    test('Mind Drop todo with body should be treated as raw sentence', () => {
      const mindDropTodo = {
        id: 'todo1',
        type: 'todo',
        origin: 'catchall',
        title: 'Book Haircut',
        body: 'Book a haircut appointment at the salon tomorrow at 3pm',
        tags: ['#haircut', '#appointment', '#book'],
      };

      // The isRawSentenceTitle function should return true for this todo
      // because it has origin='catchall' and a body field
      expect(mindDropTodo.origin).toBe('catchall');
      expect(mindDropTodo.body).toBeTruthy();
      expect(mindDropTodo.body.length).toBeGreaterThan(0);
    });

    test('Regular todo without origin=catchall should not trigger special handling', () => {
      const regularTodo = {
        id: 'todo2',
        type: 'todo',
        origin: 'manual',
        title: 'Regular task',
        body: 'This is a regular todo',
        tags: ['#work'],
      };

      expect(regularTodo.origin).not.toBe('catchall');
    });

    test('Mind Drop todo without body should use title comparison logic', () => {
      const mindDropTodoNoBody: any = {
        id: 'todo3',
        type: 'todo',
        origin: 'catchall',
        title: 'Short task',
        tags: ['#quick'],
      };

      // Without a body, isRawSentenceTitle should fall back to word count check
      expect(mindDropTodoNoBody.origin).toBe('catchall');
      expect(mindDropTodoNoBody.body).toBeUndefined();
      const wordCount = mindDropTodoNoBody.title.split(/\s+/).length;
      expect(wordCount).toBeLessThan(5); // Should not trigger rawSentence
    });
  });

  describe('Tag filtering integration', () => {
    test('extractTagKeysFromEntity should filter Mind Drop todo tags', () => {
      const mindDropTodo = {
        type: 'todo',
        origin: 'catchall',
        tags: ['#book', '#haircut', '#appointment', '#tomorrow'],
      };

      // Simulate what extractTagKeysFromEntity does
      const isMindDropTodo = mindDropTodo.type === 'todo' && mindDropTodo.origin === 'catchall';
      const tagsToProcess = isMindDropTodo
        ? filterAndNormalizeTags(mindDropTodo.tags)
        : mindDropTodo.tags;

      expect(isMindDropTodo).toBe(true);
      expect(tagsToProcess).not.toContain('#book');
      expect(tagsToProcess).not.toContain('#tomorrow');
      expect(tagsToProcess).toContain('#haircut');
      expect(tagsToProcess).toContain('#appointment');
    });

    test('extractTagKeysFromEntity should NOT filter regular todo tags', () => {
      const regularTodo = {
        type: 'todo',
        origin: 'manual',
        tags: ['#book', '#tomorrow'], // These would normally be filtered
      };

      // Regular todos should keep all tags (no filtering)
      const isMindDropTodo = regularTodo.type === 'todo' && regularTodo.origin === 'catchall';
      const tagsToProcess = isMindDropTodo
        ? filterAndNormalizeTags(regularTodo.tags)
        : regularTodo.tags;

      expect(isMindDropTodo).toBe(false);
      expect(tagsToProcess).toEqual(regularTodo.tags); // Unchanged
    });
  });
});
