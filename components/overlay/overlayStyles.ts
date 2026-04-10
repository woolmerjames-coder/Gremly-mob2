import { StyleSheet } from 'react-native';
import {
  lightTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../design/tokens';

export const styles = StyleSheet.create({
  textArea: {
    minHeight: 120,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlignVertical: 'top',
  },

  /* Due date pill styling */
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  dueDateIcon: {
    marginRight: 6,
  },
  dueDateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222222',
  },

  /* Lock In feature styles */
  dueAndLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueDateLeft: {
    flex: 1,
  },
  dueDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    minHeight: 44, // Ensure adequate touch target
  },
  lockInRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockIcon: {
    opacity: 0.7,
    marginRight: 2,
  },
  lockLabel: {
    fontSize: 13,
    color: '#222222',
    fontWeight: '500',
  },
  lockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#E0F0E5',
  },
  lockedBadgeText: {
    fontSize: 11,
    color: '#2E5540',
    fontWeight: '500',
  },

  /* Time estimate modal styles */
  timeEstimateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeEstimateOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    minWidth: '30%',
    alignItems: 'center',
  },
  timeEstimateOptionSelected: {
    backgroundColor: lightTokens.colors.moss,
  },
  timeEstimateOptionText: {
    fontSize: 14,
    color: '#333333',
  },
  timeEstimateOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timeEstimateClearButton: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  timeEstimateClearButtonText: {
    fontSize: 14,
    color: '#888888',
  },

  /* Habit date row styling */
  habitDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingLeft: 12,
  },
  habitDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  habitDateText: {
    fontSize: 13,
    color: '#666666',
  },

  /* Schedule Popover styles */
  schedulePopoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    minHeight: 44,
  },
  schedulePopoverLabel: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },
  schedulePopoverValue: {
    fontSize: 14,
    color: '#666666',
  },
  schedulePopoverDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  /* Title actions styling */
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  /* Details panel layout */
  detailsContainer: {
    paddingHorizontal: tokenSpacing.base,
    paddingVertical: tokenSpacing.sm,
    borderRadius: tokenRadius.md,
    backgroundColor: lightTokens.colors.surface || '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightTokens.colors.border,
    // use token elevation for a subtle shadow
    ...lightTokens.elevation.lg,
  },

  controlButton: {
    minHeight: 36,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scopeSelector: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: tokenSpacing.md,
  },

  chip: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.md,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
  },
  chipSmall: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.sm,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    marginRight: tokenSpacing.sm,
    marginBottom: tokenSpacing.xs,
  },
  listItem: {
    alignItems: 'center',
    marginBottom: tokenSpacing.sm,
    minHeight: 44,
  },

  /* Detail row styles for redesigned To-Do details section */
  /* Details row styles - unified layout */
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 10,
  },
  detailsRowPressed: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  detailsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsRowIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailsRowLabel: {
    fontSize: 14,
    color: '#222222',
  },
  detailsRowValue: {
    fontSize: 14,
    color: '#8A8F8A',
  },
  deleteText: {
    color: '#D9534F',
    fontWeight: '500',
    fontSize: 14,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },

  /* Log meta row styles (Phase L2) */
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  logTimestampText: {
    fontSize: 13,
    color: '#666666',
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingVertical: 6,
    paddingLeft: 6,
  },
  moodButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F6F3', // subtle sage tint
  },
  moodButtonActive: {
    backgroundColor: '#CDE8D0', // deeper sage when selected
  },
  // New mood picker styles
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  moodChipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  moodPickerExpanded: {
    flexDirection: 'column',
    gap: 12,
    flex: 1,
  },
  moodCategoryRow: {
    flexDirection: 'column',
    gap: 6,
  },
  moodCategoryLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moodOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  moodOptionChipActive: {
    // Active state handled inline
  },
  moodOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  moodDoneButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 4,
  },
  moodDoneButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  // Legacy mood pill styles (Phase L2, deprecated in L4)
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  moodPillText: {
    fontSize: 13,
  },

  /* Photo support styles (Phase L3) */
  photoContainer: {
    position: 'relative',
    width: '100%',
    marginTop: 12,
  },
  photoThumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  photoRemoveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  addPhotoButton: {
    alignSelf: 'flex-end',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  imageModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImage: {
    width: '100%',
    height: '100%',
  },

  /* Multi-photo grid styles (Phase L5) */
  photoGridScroll: {
    marginBottom: 8,
  },
  photoGridContent: {
    gap: 8,
    paddingRight: 4,
  },
  photoThumbnailContainer: {
    position: 'relative',
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoGridThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
  },
  photoGridDeleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  addMorePhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    gap: 6,
  },
  addMorePhotosText: {
    fontSize: 14,
    color: '#666666',
  },

  /* ===== Schedule Modal Styles ===== */
  scheduleModalContent: {
    backgroundColor: '#FFFDF5',
    borderRadius: 16,
    marginHorizontal: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    maxHeight: '85%',
    alignSelf: 'stretch',
  },
  scheduleModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  schSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B665C',
    marginBottom: 10,
  },
  schDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E0D8',
    marginVertical: 16,
  },
  scheduleModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E0D8',
  },
  scheduleModalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  scheduleModalCancelText: {
    fontSize: 15,
    color: '#6B665C',
    fontWeight: '500',
  },
  scheduleModalSetButton: {
    backgroundColor: '#2D4A3E',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  scheduleModalSetText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
