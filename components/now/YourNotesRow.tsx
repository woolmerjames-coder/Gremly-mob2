/**
 * YourNotesRow - Row component for displaying individual logs in the Your Notes hub
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [icon]  Sunday reflection                                today │
 * │         Journal  · Work                                        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Changes from v1:
 * - Replaced emoji icons with Lucide icons
 * - Added Space chip to show which Space a note belongs to
 */

import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { format, isToday, isYesterday, parseISO, differenceInDays } from 'date-fns';
import { getDateService } from '../../lib/date';
import { BookOpen, Lightbulb, FileText } from 'lucide-react-native';
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import type { LogItem } from '../../lib/notes/useRecentLogs';

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens
// ─────────────────────────────────────────────────────────────────────────────
const MOSS_GREEN = '#2E5540';

// Icon colors by subtype
const ICON_COLORS = {
  journal: MOSS_GREEN,
  idea: '#D4A017', // Amber/gold
  general: '#777777', // Subtle grey
} as const;

// Divider color
const DIVIDER_COLOR = '#E8E6E1';

// Space chip colors
const SPACE_CHIP_BG = 'rgba(46, 85, 64, 0.08)';
const SPACE_CHIP_TEXT = MOSS_GREEN;

// Row height
const ROW_HEIGHT = 68;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface YourNotesRowProps {
  log: LogItem;
  onPress: (log: LogItem) => void;
  spaceName?: string;
  isFirst?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format timestamp for display
 * - Today: "today"
 * - Yesterday: "yesterday"
 * - This week: day name ("Monday")
 * - Older: "Nov 25"
 */
function formatTimestamp(dateString: string): string {
  try {
    const date = parseISO(dateString);
    const now = getDateService().now();

    if (isToday(date)) {
      return 'today';
    }

    if (isYesterday(date)) {
      return 'yesterday';
    }

    // Check if within this week (past 7 days)
    const daysDiff = differenceInDays(now, date);
    if (daysDiff < 7) {
      return format(date, 'EEEE'); // "Monday", "Tuesday", etc.
    }

    // Older - show abbreviated date
    return format(date, 'MMM d'); // "Nov 25"
  } catch {
    return '';
  }
}

/**
 * Build subtitle text based on log type
 */
function buildSubtitle(log: LogItem): string {
  const { logSubtype, isList, listItems } = log;

  switch (logSubtype) {
    case 'journal':
      return 'Journal';

    case 'idea':
      return 'Idea';

    case 'general':
      if (isList && listItems && listItems.length > 0) {
        const checkedCount = listItems.filter((item) => item.checked).length;
        const totalCount = listItems.length;
        if (checkedCount > 0) {
          return `General · ${checkedCount}/${totalCount} done`;
        }
        return `General · ${totalCount} item${totalCount !== 1 ? 's' : ''}`;
      }
      return 'General';

    default:
      return 'Note';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function YourNotesRow({ log, onPress, spaceName, isFirst = false }: YourNotesRowProps) {
  const tokens = useTokens();

  const iconColor = ICON_COLORS[log.logSubtype] || ICON_COLORS.general;
  const timestamp = formatTimestamp(log.createdAt);
  const subtitle = buildSubtitle(log);

  // Render icon based on subtype
  const renderIcon = () => {
    const iconProps = { size: 20, color: iconColor, strokeWidth: 1.75 };
    switch (log.logSubtype) {
      case 'journal':
        return <BookOpen {...iconProps} />;
      case 'idea':
        return <Lightbulb {...iconProps} />;
      case 'general':
      default:
        return <FileText {...iconProps} />;
    }
  };

  return (
    <View style={styles.rowWrapper}>
      {/* Top divider - only show if not first item */}
      {!isFirst && <View style={styles.divider} />}

      <TouchableOpacity
        style={styles.rowContainer}
        onPress={() => onPress(log)}
        activeOpacity={0.7}
      >
        {/* Icon */}
        <View style={styles.iconContainer}>{renderIcon()}</View>

        {/* Content area */}
        <Box style={styles.content}>
          {/* Title row with timestamp */}
          <Box style={styles.titleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                {
                  color: tokens.colors.text,
                  fontFamily: tokens.typography.fontFamily.medium,
                },
              ]}
            >
              {log.title || 'Untitled'}
            </Text>
            {timestamp && (
              <Text
                style={[
                  styles.timestamp,
                  {
                    color: tokens.colors.subtle,
                    fontFamily: tokens.typography.fontFamily.regular,
                  },
                ]}
              >
                {timestamp}
              </Text>
            )}
          </Box>

          {/* Subtitle row with optional Space chip */}
          <View style={styles.subtitleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.subtitle,
                {
                  color: tokens.colors.subtle,
                  fontFamily: tokens.typography.fontFamily.regular,
                },
              ]}
            >
              {subtitle}
            </Text>

            {spaceName && (
              <>
                <Text style={styles.subtitleDot}>·</Text>
                <View style={styles.spaceChip}>
                  <Text style={styles.spaceChipText} numberOfLines={1}>
                    {spaceName}
                  </Text>
                </View>
              </>
            )}
          </View>
        </Box>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rowWrapper: {
    backgroundColor: '#FDF8F3', // Match warm Gremly background
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 52, // Align with content after icon
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: ROW_HEIGHT,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
    lineHeight: 16,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  subtitleDot: {
    fontSize: 12,
    color: '#999999',
    marginHorizontal: 6,
  },
  spaceChip: {
    backgroundColor: SPACE_CHIP_BG,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    maxWidth: 120,
  },
  spaceChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: SPACE_CHIP_TEXT,
  },
});

export default YourNotesRow;
