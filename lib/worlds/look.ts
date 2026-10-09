/**
 * The look James chose for the new Worlds (look A, "Up next", from the
 * version 2 prototype): colours, type and each World's tint. Built on the
 * brand tokens where they exist.
 */
import { lightTokens } from '../../design/tokens';
import type { WorldTint } from './model';

const t = lightTokens.colors;

export const W = {
  linen: t.linenCream, // #F9F6F1
  linen2: t.linenCreamLight, // #F3EFE8
  white: '#FFFFFF',
  moss: t.mossGreen, // #2E5540
  sage: t.sageMist, // #BFD8C0
  sageWash: '#EAF2E8',
  track: '#E4EDE2',
  forest: t.deepForest, // #1A3328
  ink: '#1F1F1F',
  muted: '#6A6F76',
  faint: '#9AA19C',
  line: 'rgba(46,85,64,0.10)',
  line2: 'rgba(46,85,64,0.16)',
  off: '#4B6A50',
  peri: t.periwinkleSmoke, // #9CA6E0
  periWash: '#ECEEFA',
  periInk: '#4A4E7A',
  pear: '#E0C47A',
  pearWash: '#F6EDD2',
  pearInk: '#6E5413',
  peach: '#F8EDE4',
  box: '#C9C5BD',
  field: '#E0E0E0',
  done: '#8C9790',
  snack: '#1A3328',
  snackInk: '#F4F1EA',
  scrim: 'rgba(15,25,20,0.36)',
  warn: '#B3412F',
  onDark: 'rgba(249,246,241,0.86)',
  onDarkSoft: 'rgba(249,246,241,0.62)',
  onDarkWash: 'rgba(249,246,241,0.12)',
} as const;

/** Each World's colour: the wash behind its Gremly and the ink that goes with it. */
export const TINT: Record<WorldTint, { wash: string; ink: string }> = {
  sage: { wash: '#EAF2E8', ink: '#2E5540' },
  peri: { wash: '#ECEEFA', ink: '#4A4E7A' },
  pear: { wash: '#F6EDD2', ink: '#6E5413' },
  peach: { wash: '#F8EDE4', ink: '#8A5630' },
  rose: { wash: '#F7E7E4', ink: '#8F4F4A' },
};

export const F = {
  ui: 'PlusJakartaSans-Bold',
  uiSemi: 'PlusJakartaSans-SemiBold',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemi: 'Inter-SemiBold',
} as const;

export const SHADOW = {
  shadowColor: '#1A3328',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/** Space under the tab bar, which floats over the screen. */
export const TAB_BAR_SPACE = 96;
