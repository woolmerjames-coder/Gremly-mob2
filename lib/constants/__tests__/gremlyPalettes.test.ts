import {
  GREMLY_PALETTES,
  getDefaultPaletteId,
  getPaletteById,
  recolorLottieJson,
} from '../gremlyPalettes';

describe('gremlyPalettes', () => {
  describe('GREMLY_PALETTES', () => {
    it('has 4 palettes', () => {
      expect(GREMLY_PALETTES).toHaveLength(4);
    });

    it('includes forest, periwinkle, golden, coral', () => {
      const ids = GREMLY_PALETTES.map((p) => p.id);
      expect(ids).toEqual(['forest', 'periwinkle', 'golden', 'coral']);
    });

    it('each palette has required shape', () => {
      for (const palette of GREMLY_PALETTES) {
        expect(palette).toHaveProperty('id');
        expect(palette).toHaveProperty('name');
        expect(palette.hex).toHaveProperty('dark');
        expect(palette.hex).toHaveProperty('mid');
        expect(palette.hex).toHaveProperty('cream');
        expect(palette.colors.dark).toHaveLength(3);
        expect(palette.colors.mid1).toHaveLength(3);
        expect(palette.colors.mid2).toHaveLength(3);
        expect(palette.colors.cream).toHaveLength(3);
      }
    });
  });

  describe('getDefaultPaletteId', () => {
    it('returns forest', () => {
      expect(getDefaultPaletteId()).toBe('forest');
    });
  });

  describe('getPaletteById', () => {
    it('returns the palette for a valid id', () => {
      const palette = getPaletteById('coral');
      expect(palette).toBeDefined();
      expect(palette!.name).toBe('Coral');
    });

    it('returns undefined for unknown id', () => {
      expect(getPaletteById('nonexistent')).toBeUndefined();
    });
  });

  describe('recolorLottieJson', () => {
    const forestFill = {
      ty: 'fl',
      c: { k: [0.157, 0.329, 0.255, 1] },
    };

    it('returns unmodified clone for forest palette', () => {
      const source = { layers: [forestFill] };
      const result = recolorLottieJson(source, 'forest');
      expect(result).toEqual(source);
      expect(result).not.toBe(source); // deep clone
    });

    it('replaces forest colors with target palette colors', () => {
      const source = { layers: [{ ...forestFill, c: { k: [0.157, 0.329, 0.255, 1] } }] };
      const result = recolorLottieJson(source, 'coral') as any;
      const coral = getPaletteById('coral')!;
      expect(result.layers[0].c.k[0]).toBeCloseTo(coral.colors.dark[0], 2);
      expect(result.layers[0].c.k[1]).toBeCloseTo(coral.colors.dark[1], 2);
      expect(result.layers[0].c.k[2]).toBeCloseTo(coral.colors.dark[2], 2);
    });

    it('does not modify source json', () => {
      const source = { layers: [{ ty: 'fl', c: { k: [0.157, 0.329, 0.255, 1] } }] };
      recolorLottieJson(source, 'periwinkle');
      expect(source.layers[0].c.k[0]).toBeCloseTo(0.157, 2);
    });

    it('returns clone for unknown palette id', () => {
      const source = { layers: [forestFill] };
      const result = recolorLottieJson(source, 'unknown');
      expect(result).toEqual(source);
    });
  });
});
