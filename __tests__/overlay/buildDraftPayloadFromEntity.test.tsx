/**
 * Unit tests for buildDraftPayloadFromEntity
 *
 * Verifies that todos correctly roundtrip their title and details fields
 * when opening for edit.
 */

import { buildDraftPayloadFromEntity } from '../../components/overlay/overlayHydration';

describe('buildDraftPayloadFromEntity - Todo roundtrip', () => {
  it('should populate todo.title and todo.details from name and body', () => {
    // Simulate a todo entity from Supabase after AI title generation
    const entity = {
      id: 'todo-1',
      type: 'todo',
      name: 'Dinner in Zipolite',
      title: 'Dinner in Zipolite',
      body: 'Find somewhere great for dinner in Zipolite',
      origin: 'catchall',
      ai_placed: true,
      space_id: null,
      created_at: '2025-11-17T10:00:00Z',
      updated_at: '2025-11-17T12:00:00Z',
    };

    const payload = buildDraftPayloadFromEntity(entity);

    // Assert: todo.title gets the short AI-generated title
    expect(payload.todo?.title).toBe('Dinner in Zipolite');

    // Assert: todo.details gets the full original sentence from body
    expect(payload.todo?.details).toBe('Find somewhere great for dinner in Zipolite');

    // Assert: baseType is set correctly
    expect(payload.baseType).toBe('todo');
  });

  it('should handle todo with only name (no body)', () => {
    const entity = {
      id: 'todo-2',
      type: 'todo',
      name: 'Quick task',
      title: 'Quick task',
      body: null,
      origin: 'catchall',
      ai_placed: false,
      space_id: null,
      created_at: '2025-11-17T10:00:00Z',
      updated_at: '2025-11-17T10:00:00Z',
    };

    const payload = buildDraftPayloadFromEntity(entity);

    // Assert: When body is null, details falls back to name
    expect(payload.todo?.title).toBe('Quick task');
    expect(payload.todo?.details).toBe('Quick task');
  });

  it('should preserve long details when body exists', () => {
    const longText =
      'This is a longer todo description with multiple words that explains what needs to be done in detail';

    const entity = {
      id: 'todo-3',
      type: 'todo',
      name: 'Complex task',
      title: 'Complex task',
      body: longText,
      origin: 'catchall',
      ai_placed: true,
      space_id: null,
      created_at: '2025-11-17T10:00:00Z',
      updated_at: '2025-11-17T10:00:00Z',
    };

    const payload = buildDraftPayloadFromEntity(entity);

    // Assert: Long text from body is preserved in details
    expect(payload.todo?.title).toBe('Complex task');
    expect(payload.todo?.details).toBe(longText);

    // Assert: title and details are different (not the same)
    expect(payload.todo?.title).not.toBe(payload.todo?.details);
  });

  it('should handle Mind Drop todo created without AI title (name === body)', () => {
    const originalSentence = 'Find somewhere great for dinner in Zipolite';

    // Initial state before AI processes it
    const entity = {
      id: 'todo-4',
      type: 'todo',
      name: originalSentence,
      title: originalSentence,
      body: originalSentence,
      origin: 'catchall',
      ai_placed: false,
      space_id: null,
      created_at: '2025-11-17T10:00:00Z',
      updated_at: '2025-11-17T10:00:00Z',
    };

    const payload = buildDraftPayloadFromEntity(entity);

    // Assert: Both title and details have the full sentence
    expect(payload.todo?.title).toBe(originalSentence);
    expect(payload.todo?.details).toBe(originalSentence);
  });

  it('should map due_day and due_time (Gremly date model)', () => {
    const entity = {
      id: 'todo-5',
      type: 'todo',
      name: 'Task with deadline',
      title: 'Task with deadline',
      body: 'Complete this task by Friday',
      due_day: '2025-11-20',
      due_time: '10:00:00',
      origin: 'catchall',
      ai_placed: false,
      space_id: null,
      created_at: '2025-11-17T10:00:00Z',
      updated_at: '2025-11-17T10:00:00Z',
    };

    const payload = buildDraftPayloadFromEntity(entity);

    // Assert: due_day and due_time are mapped correctly (Gremly date model)
    // Note: due_at is explicitly null - Gremly uses due_day/due_time instead
    expect(payload.todo?.due_at).toBeNull();
    expect(payload.todo?.due_day).toBe('2025-11-20');
    expect(payload.todo?.due_time).toBe('10:00:00');
    expect(payload.todo?.title).toBe('Task with deadline');
    expect(payload.todo?.details).toBe('Complete this task by Friday');
  });
});
