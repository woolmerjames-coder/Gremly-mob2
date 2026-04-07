// ---------------------------------------------------------------------------
// Gremly Lottie palette definitions & runtime recoloring
// ---------------------------------------------------------------------------

export interface GremlyPalette {
  id: string;
  name: string;
  hex: { dark: string; mid: string; cream: string };
  colors: {
    dark: [number, number, number];
    mid1: [number, number, number];
    mid2: [number, number, number];
    cream: [number, number, number];
  };
}

// Source colors baked into the Lottie JSON (forest palette)
const SOURCE_COLORS = {
  dark: [0.157, 0.329, 0.255] as [number, number, number],
  mid1: [0.373, 0.588, 0.431] as [number, number, number],
  mid2: [0.318, 0.51, 0.365] as [number, number, number],
  cream: [0.941, 0.914, 0.741] as [number, number, number],
};

export const GREMLY_PALETTES: GremlyPalette[] = [
  {
    id: 'forest',
    name: 'Forest',
    hex: { dark: '#285441', mid: '#5f966e', cream: '#f0e9bd' },
    colors: {
      dark: [0.157, 0.329, 0.255],
      mid1: [0.373, 0.588, 0.431],
      mid2: [0.318, 0.51, 0.365],
      cream: [0.941, 0.914, 0.741],
    },
  },
  {
    id: 'periwinkle',
    name: 'Periwinkle',
    hex: { dark: '#4A4E7A', mid: '#8B8FC2', cream: '#E8E6F0' },
    colors: {
      dark: [0.29, 0.306, 0.478],
      mid1: [0.545, 0.561, 0.761],
      mid2: [0.459, 0.475, 0.667],
      cream: [0.91, 0.902, 0.941],
    },
  },
  {
    id: 'golden',
    name: 'Golden',
    hex: { dark: '#8B6914', mid: '#D4A832', cream: '#F5EDCF' },
    colors: {
      dark: [0.545, 0.412, 0.078],
      mid1: [0.831, 0.659, 0.196],
      mid2: [0.718, 0.557, 0.149],
      cream: [0.961, 0.929, 0.812],
    },
  },
  {
    id: 'coral',
    name: 'Coral',
    hex: { dark: '#8B4049', mid: '#D47A7A', cream: '#F5E0DC' },
    colors: {
      dark: [0.545, 0.251, 0.286],
      mid1: [0.831, 0.478, 0.478],
      mid2: [0.718, 0.388, 0.388],
      cream: [0.961, 0.878, 0.863],
    },
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getDefaultPaletteId(): string {
  return 'forest';
}

export function getPaletteById(id: string): GremlyPalette | undefined {
  return GREMLY_PALETTES.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Lottie JSON recoloring
// ---------------------------------------------------------------------------

const TOLERANCE = 0.02;

type RGB = [number, number, number];

function colorsMatch(a: RGB, b: RGB): boolean {
  return (
    Math.abs(a[0] - b[0]) < TOLERANCE &&
    Math.abs(a[1] - b[1]) < TOLERANCE &&
    Math.abs(a[2] - b[2]) < TOLERANCE
  );
}

/**
 * Build a source→target mapping array for the given palette.
 * Each entry is [sourceRGB, targetRGB].
 */
function buildColorMap(palette: GremlyPalette): [RGB, RGB][] {
  return [
    [SOURCE_COLORS.dark, palette.colors.dark],
    [SOURCE_COLORS.mid1, palette.colors.mid1],
    [SOURCE_COLORS.mid2, palette.colors.mid2],
    [SOURCE_COLORS.cream, palette.colors.cream],
  ];
}

function walkAndReplace(node: any, colorMap: [RGB, RGB][]): void {
  if (node == null || typeof node !== 'object') return;

  // Fill (ty:"fl") or Stroke (ty:"st") — color lives at node.c.k
  if ((node.ty === 'fl' || node.ty === 'st') && node.c && Array.isArray(node.c.k)) {
    const k = node.c.k as number[];
    // Static color: k is [r, g, b] or [r, g, b, a]
    if (k.length >= 3 && typeof k[0] === 'number') {
      for (const [src, tgt] of colorMap) {
        if (colorsMatch([k[0], k[1], k[2]], src)) {
          k[0] = tgt[0];
          k[1] = tgt[1];
          k[2] = tgt[2];
          break;
        }
      }
    }
    // Animated color: k is an array of keyframes, each with .s and/or .e arrays
    if (k.length > 0 && typeof k[0] === 'object') {
      for (const keyframe of k as any[]) {
        for (const field of ['s', 'e'] as const) {
          const arr = keyframe[field];
          if (Array.isArray(arr) && arr.length >= 3 && typeof arr[0] === 'number') {
            for (const [src, tgt] of colorMap) {
              if (colorsMatch([arr[0], arr[1], arr[2]], src)) {
                arr[0] = tgt[0];
                arr[1] = tgt[1];
                arr[2] = tgt[2];
                break;
              }
            }
          }
        }
      }
    }
  }

  // Recurse into arrays and objects
  if (Array.isArray(node)) {
    for (const child of node) walkAndReplace(child, colorMap);
  } else {
    for (const key of Object.keys(node)) {
      if (typeof node[key] === 'object' && node[key] !== null) {
        walkAndReplace(node[key], colorMap);
      }
    }
  }
}

/**
 * Return a deep-cloned copy of `sourceJson` with all Lottie fill/stroke
 * colors matching the forest (source) palette replaced by the target palette.
 * If paletteId is 'forest' or not found, returns an unmodified clone.
 */
export function recolorLottieJson(sourceJson: object, paletteId: string): object {
  const clone = JSON.parse(JSON.stringify(sourceJson));
  const palette = getPaletteById(paletteId);
  if (!palette || palette.id === 'forest') return clone;

  const colorMap = buildColorMap(palette);
  walkAndReplace(clone, colorMap);
  return clone;
}
