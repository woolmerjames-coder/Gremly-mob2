/**
 * Card Styles
 * From: app/screens/CatchAllNotepad.tsx (lines 6085-6230)
 */

const styles = {
  recentCard: {
    backgroundColor: '#FDFCFA',
    borderRadius: 12,
    height: 90,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46,85,64,0.15)',
    shadowColor: 'rgba(46,85,64,0.12)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    justifyContent: 'space-between',
  },

  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  recentTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  recentTitle: {
    color: c.charcoalInk,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },

  recentConfirmation: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: c.mossGreen, // ← Moss green for "Gremly speaking" feel
    fontStyle: 'italic',
  },

  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  recentContextPill: {
    backgroundColor: 'rgba(191, 216, 192, 0.3)', // Very light sage
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 12,
    color: c.mutedText,
    fontFamily: 'Inter-Regular',
    overflow: 'hidden',
  },

  recentMetaTime: {
    color: c.mutedText,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    flexShrink: 0,
  },

  recentCategoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 10,
    overflow: 'hidden',
    color: c.mutedText,
    backgroundColor: c.sageTint,
    fontFamily: 'Inter-Medium',
    textTransform: 'capitalize',
  },

  badge_note: {
    backgroundColor: c.sageTint,
  },
  badge_todo: {
    backgroundColor: '#E6F0FF',
  },
  badge_habit: {
    backgroundColor: '#EAF7ED',
  },
};
