/**
 * YourNotesRow - Row component for displaying individual logs in the Your Notes hub
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │ 📓  Sunday reflection             today │
 * │     Journal                             │
 * └─────────────────────────────────────────┘
 */

import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { format, isToday, isYesterday, parseISO, differenceInDays, startOfWeek } from 'date-fns';
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import type { LogItem } from '../../lib/notes/useRecentLogs';

// Icon colors by subtype
const ICON_COLORS = {
  journal: '#2E5540', // Brand moss green
  idea: '#D4A017', // Amber/yellow
  general: '#888888', // Grey
} as const;

// Emojis by subtype
const SUBTYPE_ICONS = {
  journal: '📓',
  idea: '💡',
  general: '📝',
} as const;

// Divider color
const DIVIDER_COLOR = '#E8E6E1';

// Row height
const ROW_HEIGHT = 64;

interface YourNotesRowProps {
  log: LogItem;
  onPress: (log: LogItem) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

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
    const now = new Date();

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

export function YourNotesRow({ log, onPress, isFirst = false, isLast = false }: YourNotesRowProps) {
  const tokens = useTokens();

  const icon = SUBTYPE_ICONS[log.logSubtype];
  const timestamp = formatTimestamp(log.createdAt);
  const subtitle = buildSubtitle(log);

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
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{icon}</Text>
        </View>

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
              {log.title}
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

          {/* Subtitle row */}
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
        </Box>
      </TouchableOpacity>
    </View>
  );
}

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
  icon: {
    fontSize: 20,
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
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
});

export default YourNotesRow;
