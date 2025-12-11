import { milestoneZ, milestoneInsertZ, milestoneUpdateZ } from '../lib/schemas';

describe('milestoneZ (row schema)', () => {
  const validMilestone = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    space_id: '550e8400-e29b-41d4-a716-446655440001',
    owner_id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Launch MVP',
    date: '2025-06-15',
    completed: false,
    completed_at: null,
    is_active: true,
    sort_order: 0,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  it('validates complete milestone with name', () => {
    const result = milestoneZ.parse(validMilestone);
    expect(result.name).toBe('Launch MVP');
    expect(result.is_active).toBe(true);
  });

  it('validates milestone with legacy title field', () => {
    const legacyMilestone = {
      ...validMilestone,
      name: undefined,
      title: 'Legacy Title',
    };
    const result = milestoneZ.parse(legacyMilestone);
    expect(result.title).toBe('Legacy Title');
  });

  it('allows null date (direction without deadline)', () => {
    const result = milestoneZ.parse({ ...validMilestone, date: null });
    expect(result.date).toBeNull();
  });

  it('defaults completed to false', () => {
    const result = milestoneZ.parse(validMilestone);
    expect(result.completed).toBe(false);
  });

  it('defaults is_active to true', () => {
    const result = milestoneZ.parse(validMilestone);
    expect(result.is_active).toBe(true);
  });
});

describe('milestoneInsertZ', () => {
  it('validates minimal insert with name', () => {
    const result = milestoneInsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Trip to Japan',
    });
    expect(result.name).toBe('Trip to Japan');
    expect(result.date).toBeUndefined();
  });

  it('requires name to be non-empty', () => {
    expect(() =>
      milestoneInsertZ.parse({
        space_id: '550e8400-e29b-41d4-a716-446655440001',
        name: '',
      }),
    ).toThrow('Milestone name is required');
  });

  it('validates with optional date', () => {
    const result = milestoneInsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Trip to Japan',
      date: '2025-06-15',
    });
    expect(result.date).toBe('2025-06-15');
  });

  it('rejects invalid date format', () => {
    expect(() =>
      milestoneInsertZ.parse({
        space_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test',
        date: '2025/06/15',
      }),
    ).toThrow();
  });

  it('allows null date explicitly', () => {
    const result = milestoneInsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'No deadline goal',
      date: null,
    });
    expect(result.date).toBeNull();
  });
});

describe('milestoneUpdateZ', () => {
  it('validates partial update with name only', () => {
    const result = milestoneUpdateZ.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('validates completion update', () => {
    const result = milestoneUpdateZ.parse({
      completed: true,
      completed_at: '2025-01-15T10:00:00Z',
      is_active: false,
    });
    expect(result.completed).toBe(true);
    expect(result.is_active).toBe(false);
  });

  it('allows empty object (no changes)', () => {
    const result = milestoneUpdateZ.parse({});
    expect(result).toEqual({});
  });
});
