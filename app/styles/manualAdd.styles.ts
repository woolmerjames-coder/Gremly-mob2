/**
 * Manual Add Overlay Styles - Phase 6 (Brand Refresh)
 * Central StyleSheet for all ManualAdd components with Gremly brand tokens
 */

import { StyleSheet } from 'react-native';
import { colors, spacing, radii, shadow } from '../design/theme';

export const overlayStyles = StyleSheet.create({
  // Backdrop with blur effect
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-end',
  },

  // Main card
  card: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '90%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadow.large,
    flex: 1,
    flexDirection: 'column',
  },

  // Header
  header: {
    paddingBottom: spacing.md,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
    color: colors.deepTeal,
  },

  exitButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  exitButtonText: {
    fontSize: 28,
    color: colors.charcoal,
    opacity: 0.5,
  },

  // Tabs row
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  tabTile: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabTileActive: {
    backgroundColor: colors.deepTeal,
    ...shadow.small,
  },

  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.deepTeal,
  },

  tabTextActive: {
    color: colors.white,
  },

  underlineWrap: {
    height: 4,
    marginTop: spacing.xs,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },

  underlineActive: {
    backgroundColor: colors.deepTeal,
  },

  // Legacy tab styles (for backward compatibility)
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabActive: {
    backgroundColor: colors.deepTeal,
    ...shadow.small,
  },

  // Body
  body: {
    flex: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.grayLine,
    backgroundColor: colors.cream,
    gap: spacing.md,
  },

  footerExitButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  footerExitText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.deepTeal,
  },

  footerSubmitButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepTeal,
    flexDirection: 'row',
    gap: spacing.sm,
    ...shadow.medium,
  },

  footerSubmitText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },

  // Pinned reminders
  pinnedReminders: {
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.grayLine,
    backgroundColor: colors.white,
  },

  pinnedRemindersTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.md,
    color: colors.deepTeal,
  },

  // Field row
  fieldRow: {
    marginBottom: spacing.lg,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    color: colors.deepTeal,
  },

  labelOptional: {
    fontSize: 12,
    color: colors.charcoal,
    opacity: 0.6,
    marginLeft: spacing.xs,
  },

  // Input
  input: {
    borderWidth: 1,
    borderColor: colors.grayLine,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.charcoal,
  },

  inputFocused: {
    borderColor: colors.mint,
    ...shadow.small,
  },

  textarea: {
    borderWidth: 1,
    borderColor: colors.grayLine,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.charcoal,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.grayLine,
    backgroundColor: colors.white,
  },

  chipActive: {
    backgroundColor: colors.deepTeal,
    borderColor: colors.deepTeal,
    ...shadow.small,
  },

  chipText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.charcoal,
  },

  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },

  // Reminder item
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.mint,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },

  reminderTime: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.deepTeal,
  },

  reminderFrequency: {
    fontSize: 12,
    color: colors.charcoal,
    opacity: 0.7,
    marginTop: 2,
  },

  reminderAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.mint,
    borderRadius: radii.md,
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },

  reminderAddText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.deepTeal,
  },

  // Utility
  hidden: {
    display: 'none',
  },

  showMoreButton: {
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },

  showMoreText: {
    fontSize: 14,
    color: colors.deepTeal,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    color: colors.deepTeal,
  },

  subToggleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
});
