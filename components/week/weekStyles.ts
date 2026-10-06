/**
 * Shared colours and shapes for the weekly review's cards, matching the
 * approved prototype (Weekly sweep prototype, "Sunday's weekly review").
 */
import { StyleSheet } from 'react-native';

export const WEEK = {
  ink: '#1A3328',
  green: '#2E5540',
  muted: '#5C6B63',
  wash: '#E7EFE8',
  line: '#C9D8CC',
  chipLine: '#DCE5DE',
  soft: '#ECE6DC',
  linen: '#F9F6F1',
  linen2: '#F3EEE5',
  white: '#FFFFFF',
  off: '#E8E3D9',
  faint: '#9AA59F',
  amber: '#F2C66D',
  amberDeep: '#E3A63A',
  amberInk: '#B7791F',
  amberDark: '#8A5A0B',
  amberWash: '#FBF1DC',
  stepWash: '#EEF3EF',
  darkLabel: '#A9C9B2',
  darkText: '#D5E3D8',
  darkTile: 'rgba(249,246,241,0.08)',
} as const;

export const weekStyles = StyleSheet.create({
  // a white card, as the priorities and the shape sit on
  card: {
    backgroundColor: WEEK.white,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  // the dark card: the challenge, and the week once it is planned
  dark: {
    backgroundColor: WEEK.ink,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  darkKicker: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 0.7,
    color: WEEK.darkLabel,
  },
  heading: { fontFamily: 'PlusJakartaSans-Bold', color: WEEK.ink },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: WEEK.ink },
  hint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, color: WEEK.muted },
  // the wide button that settles a step
  main: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WEEK.green,
  },
  mainOff: { backgroundColor: WEEK.off },
  mainText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: WEEK.linen },
  mainTextOff: { color: WEEK.muted },
  // the same button in white, for the quieter way on
  second: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WEEK.white,
    borderWidth: 1,
    borderColor: WEEK.line,
  },
  secondText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: WEEK.ink },
  pair: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  // Change, Just plan it: a quiet word to tap
  link: { alignSelf: 'flex-start', paddingVertical: 2 },
  linkText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: WEEK.green },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // what they settled, as their own message under the card
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: 280,
    backgroundColor: WEEK.green,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  bubbleText: { fontFamily: 'Inter-Regular', fontSize: 16, lineHeight: 21, color: WEEK.linen },
  off: { opacity: 0.5 },
});
