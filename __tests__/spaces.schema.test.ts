import { spaceInsertSchema } from '../lib/schemas';

describe('spaceInsertSchema', () => {
  it('validates name is required', () => {
    expect(() => spaceInsertSchema.parse({ name: '' })).toThrow();
    expect(() => spaceInsertSchema.parse({})).toThrow();
  });

  it('accepts valid name', () => {
    const result = spaceInsertSchema.parse({ name: 'Fitness' });
    expect(result.name).toBe('Fitness');
  });

  it('accepts optional icon', () => {
    const result = spaceInsertSchema.parse({ name: 'Work', icon: 'briefcase' });
    expect(result.icon).toBe('briefcase');
  });

  it('accepts optional theme', () => {
    const result = spaceInsertSchema.parse({ name: 'Home', theme: 'mint' });
    expect(result.theme).toBe('mint');
  });

  it('rejects invalid theme', () => {
    expect(() => spaceInsertSchema.parse({ name: 'Test', theme: 'invalid' })).toThrow();
  });

  it('accepts all valid themes', () => {
    const themes = ['deepTeal', 'mint', 'cream', 'periwinkle'] as const;
    themes.forEach((theme) => {
      const result = spaceInsertSchema.parse({ name: 'Test', theme });
      expect(result.theme).toBe(theme);
    });
  });
});
