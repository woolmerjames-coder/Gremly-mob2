import { lightTokens } from '../../design/tokens';

export interface AvatarPalette {
  bg: string;
  fg: string;
}

export function avatarForIndex(i: number): AvatarPalette {
  const palette = lightTokens.colors.avatarPalette;
  return palette[i % palette.length];
}
