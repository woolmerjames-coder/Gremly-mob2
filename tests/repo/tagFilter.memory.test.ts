import { MemoryRepo } from '../../lib/repo/memory';
import type { Note } from '../../lib/types';

describe('MemoryRepo tagNames filtering', () => {
  let repo: MemoryRepo;
  let focusProject: Note;
  let focusOnly: Note;

  beforeEach(() => {
    repo = new MemoryRepo('tag-filter-user');

    const now = new Date().toISOString();

    focusProject = {
      id: 'note-focus-project',
      type: 'note',
      subtype: 'idea',
      title: 'Deep Work Plan',
      body: 'Plan the week',
      ai_placed: false,
      why_string: null,
      origin: null,
      tags: ['#Focus', '*Project'],
      created_at: now,
      updated_at: now,
      owner_id: 'tag-filter-user',
      space_id: null,
    };

    focusOnly = {
      id: 'note-focus-only',
      type: 'note',
      subtype: 'idea',
      title: 'Focus Only',
      body: 'Single tag',
      ai_placed: false,
      why_string: null,
      origin: null,
      tags: ['#focus'],
      created_at: now,
      updated_at: now,
      owner_id: 'tag-filter-user',
      space_id: null,
    };

    const projectOnly: Note = {
      id: 'note-project-only',
      type: 'note',
      subtype: 'idea',
      title: 'Project Only',
      body: 'Project tag',
      ai_placed: false,
      why_string: null,
      origin: null,
      tags: ['*project'],
      created_at: now,
      updated_at: now,
      owner_id: 'tag-filter-user',
      space_id: null,
    };

    (repo as unknown as { data: Note[] }).data = [focusProject, focusOnly, projectOnly];
  });

  test('matches items containing requested tag name (case-insensitive)', async () => {
    const results = await repo.listByType('note', { tagNames: ['#focus'] });
    const ids = results.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining([focusProject.id, focusOnly.id]));
  });

  test('requires all provided tag names (AND semantics)', async () => {
    const results = await repo.listByType('note', { tagNames: ['#focus', '*project'] });

    expect(results.map((item) => item.id)).toEqual([focusProject.id]);
  });

  test('returns empty array when any tag is missing', async () => {
    const results = await repo.listByType('note', { tagNames: ['#focus', '@missing'] });

    expect(results).toHaveLength(0);
  });
});
