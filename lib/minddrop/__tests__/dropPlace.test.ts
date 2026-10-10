/**
 * dropPlace: where a drop lives on its card (Mind Drop rethink stage 9): the
 * Chapter, else the World, else nothing; the person's own choice first.
 */
import { dropPlaceOf } from '../dropPlace';

const worlds = [
  { id: 'w1', name: 'Travel', display_name: null, phase: 'active' },
  { id: 'w2', name: 'Home', display_name: 'Home life', phase: 'active' },
  { id: 'w3', name: 'Old band', display_name: null, phase: 'archived' },
] as any[];
const chapters = [
  { id: 'c1', title: 'Lisbon trip', phase: 'active' },
  { id: 'c2', title: 'Last summer', phase: 'closed' },
] as any[];
const wl = (
  drop_id: string,
  world_id: string,
  assigned_by = 'classifier',
  created_at = '2026-10-09T10:00:00Z',
) => ({ drop_id, world_id, assigned_by, created_at }) as any;
const cl = (
  drop_id: string,
  chapter_id: string,
  assigned_by = 'classifier',
  created_at = '2026-10-09T10:00:00Z',
) => ({ drop_id, chapter_id, assigned_by, created_at }) as any;
const place = (id: string, worldLinks: any[], chapterLinks: any[] = []) =>
  dropPlaceOf(id, { worldLinks, chapterLinks, worlds, chapters });

describe('where a drop lives', () => {
  it('the Chapter when it is in one', () => {
    expect(place('d', [wl('d', 'w1')], [cl('d', 'c1')])).toEqual({
      kind: 'chapter',
      id: 'c1',
      name: 'Lisbon trip',
    });
  });

  it('otherwise the World, by the name they gave it', () => {
    expect(place('d', [wl('d', 'w1')])?.name).toBe('Travel');
    expect(place('d', [wl('d', 'w2')])?.name).toBe('Home life');
  });

  it('otherwise nothing: filed nowhere asks nothing', () => {
    expect(place('d', [])).toBeNull();
    expect(place('d', [wl('other', 'w1')])).toBeNull();
    expect(dropPlaceOf(null, { worldLinks: [], chapterLinks: [], worlds, chapters })).toBeNull();
  });

  it('the person’s own choice comes first, then the newest', () => {
    expect(
      place('d', [
        wl('d', 'w1', 'classifier', '2026-10-09T12:00:00Z'),
        wl('d', 'w2', 'user', '2026-10-01T10:00:00Z'),
      ])?.name,
    ).toBe('Home life');
    expect(
      place('d', [
        wl('d', 'w1', 'classifier', '2026-10-01T10:00:00Z'),
        wl('d', 'w2', 'classifier', '2026-10-09T12:00:00Z'),
      ])?.name,
    ).toBe('Home life');
  });

  it('a closed Chapter or an archived World is not shown', () => {
    expect(place('d', [wl('d', 'w1')], [cl('d', 'c2')])?.name).toBe('Travel');
    expect(place('d', [wl('d', 'w3')])).toBeNull();
  });
});
