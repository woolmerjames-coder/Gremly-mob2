import { spaceMetaZ, spaceMetaUpsertZ } from '../lib/schemas';

describe('spaceMetaZ (row schema)', () => {
  const validMeta = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    space_id: '550e8400-e29b-41d4-a716-446655440001',
    success_criteria: 'Relaxed trip, wife happy with restaurants',
    other_context: 'Wife prefers quiet spots',
    owner_id: '550e8400-e29b-41d4-a716-446655440002',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  it('validates complete meta', () => {
    const result = spaceMetaZ.parse(validMeta);
    expect(result.success_criteria).toBe('Relaxed trip, wife happy with restaurants');
    expect(result.other_context).toBe('Wife prefers quiet spots');
  });

  it('allows null success_criteria', () => {
    const result = spaceMetaZ.parse({
      ...validMeta,
      success_criteria: null,
    });
    expect(result.success_criteria).toBeNull();
  });

  it('allows null other_context', () => {
    const result = spaceMetaZ.parse({
      ...validMeta,
      other_context: null,
    });
    expect(result.other_context).toBeNull();
  });

  it('allows both fields null', () => {
    const result = spaceMetaZ.parse({
      ...validMeta,
      success_criteria: null,
      other_context: null,
    });
    expect(result.success_criteria).toBeNull();
    expect(result.other_context).toBeNull();
  });
});

describe('spaceMetaUpsertZ', () => {
  it('validates minimal upsert (space_id only)', () => {
    const result = spaceMetaUpsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.space_id).toBeDefined();
    expect(result.success_criteria).toBeUndefined();
    expect(result.other_context).toBeUndefined();
  });

  it('validates upsert with success_criteria only', () => {
    const result = spaceMetaUpsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
      success_criteria: 'Ship by June',
    });
    expect(result.success_criteria).toBe('Ship by June');
  });

  it('validates upsert with other_context only', () => {
    const result = spaceMetaUpsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
      other_context: 'Focus on mobile first',
    });
    expect(result.other_context).toBe('Focus on mobile first');
  });

  it('validates full upsert', () => {
    const result = spaceMetaUpsertZ.parse({
      space_id: '550e8400-e29b-41d4-a716-446655440001',
      success_criteria: 'Ship by June',
      other_context: 'Focus on mobile first',
    });
    expect(result.success_criteria).toBe('Ship by June');
    expect(result.other_context).toBe('Focus on mobile first');
  });
});
