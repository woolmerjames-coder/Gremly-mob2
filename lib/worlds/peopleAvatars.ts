export interface AvatarPalette {
  bg: string;
  fg: string;
}

export const AVATAR_PALETTE: AvatarPalette[] = [
  { bg: '#D5E4D0', fg: '#1A3A28' },
  { bg: '#EBDDC5', fg: '#6B4A2E' },
  { bg: '#E2DFEE', fg: '#5A3B5A' },
  { bg: '#D9E1EA', fg: '#2C4A5C' },
  { bg: '#F1D8C9', fg: '#8C3F1E' },
  { bg: '#D0E0DA', fg: '#2E5540' },
  { bg: '#E8D6DF', fg: '#7B3F57' },
  { bg: '#DDE3D0', fg: '#4B5A33' },
];

export function avatarForIndex(i: number): AvatarPalette {
  return AVATAR_PALETTE[i % AVATAR_PALETTE.length];
}
