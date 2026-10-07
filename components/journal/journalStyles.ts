/** Shared shapes for the journal page, in the brief's colours. */
import { StyleSheet } from 'react-native';
import { BRIEF } from '../brief/briefStyles';

/** The wash behind the top of the page while writing, and while looking back */
export const JOURNAL_WASH = '#ECEEFA';
export const JOURNAL_WASH_LOOKING = '#F6EDD2';
const FOCUS_BORDER = 'rgba(46, 85, 64, 0.38)';
const DASH = 'rgba(46, 85, 64, 0.30)';

export const journalStyles = StyleSheet.create({
  card: {
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRIEF.line,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 15,
    shadowColor: BRIEF.mossInk,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardFocused: { borderColor: FOCUS_BORDER, shadowOpacity: 0.12 },
  // a section's label, as on Today: a short bar, then small capitals
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 20,
  },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: BRIEF.peri },
  sectionText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: BRIEF.periInk,
  },
  // a dashed pill for adding something
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingLeft: 11,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: DASH,
  },
  addText: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: BRIEF.moss },
  mood: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  moodOn: { backgroundColor: JOURNAL_WASH, borderColor: BRIEF.peri },
  moodText: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: BRIEF.moss },
  moodTextOn: { color: BRIEF.periInk },
});
