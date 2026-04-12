import { StyleSheet } from 'react-native';
import {
  lightTokens,
  spacing as tokenSpacing,
  borderRadius as tokenRadius,
} from '../../design/tokens';

export const styles = StyleSheet.create({
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

  chipSmall: {
    minHeight: 44,
    paddingHorizontal: tokenSpacing.sm,
    paddingVertical: tokenSpacing.xs,
    borderRadius: tokenRadius.sm,
    justifyContent: 'center',
    marginRight: tokenSpacing.sm,
    marginBottom: tokenSpacing.xs,
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
});
