/**
 * NowProgressPopup - Shows today's completed items with undo capability
 *
 * Updated to match divider-style Today list layout:
 * - Left accent bar (green for habits, blue for todos)
 * - Clean divider lines between items
 * - Two-line layout: title + timestamp, then meta + undo link
 * - Green check icon in header
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, ScrollView, View } from 'react-native';
import { Box, Text } from '../../ui';
import { CompletionCheckIcon } from '../today/CompletionCheckIcon';
import type { NowCompletedItem } from '../../lib/now/nowTypes';

// Accent colors - same as NowFocusRow
const ACCENT_COLORS = {
  habit: '#2E5540', // Moss Green
  todo: '#4A7FBF', // Soft blue
} as const;

// Divider color - same as NowFocusRow
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// Moss Green for undo link
const MOSS_GREEN = '#2E5540';

interface NowProgressPopupProps {
  visible: boolean;
  completed: NowCompletedItem[];
  /** Total tasks for today */
  totalTasksToday: number;
  /** Total completed tasks for today */
  totalCompletedToday: number;
  onClose: () => void;
  onUndoItem?: (item: NowCompletedItem) => void;
}

export function NowProgressPopup({
  visible,
  completed,
  totalTasksToday,
  totalCompletedToday,
  onClose,
  onUndoItem,
}: NowProgressPopupProps) {
  // Format time as "3:19pm" (lowercase am/pm)
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date
      .toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      .toLowerCase()
      .replace(' ', '');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <CompletionCheckIcon completed={completed.length > 0} size={16} />
              <Text style={styles.title}>Completed</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            {completed.length === 0 ? (
              <Text style={styles.emptyText}>No items completed yet today</Text>
            ) : (
              completed.map((item, index) => {
                const accentColor = ACCENT_COLORS[item.type];
                const metaLabel = item.type === 'habit' ? 'Habit · Daily' : 'Todo';
                const timeLabel = formatTime(item.completedAt);
                const isFirst = index === 0;

                return (
                  <View key={item.id || index}>
                    {/* Divider - only between items, not above first */}
                    {!isFirst && <View style={styles.divider} />}

                    <View style={styles.row}>
                      {/* Left accent bar */}
                      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

                      {/* Content */}
                      <View style={styles.content}>
                        {/* Line 1: Title + Timestamp */}
                        <View style={styles.line1}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.timestamp}>{timeLabel}</Text>
                        </View>

                        {/* Line 2: Meta + Undo */}
                        <View style={styles.line2}>
                          <Text style={styles.metaLabel}>{metaLabel}</Text>
                          {onUndoItem && (
                            <TouchableOpacity
                              onPress={() => onUndoItem(item)}
                              style={styles.undoButton}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Text style={styles.undoText}>Undo</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER_COLOR,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 16,
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 34,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 13, // Align with title text (accent bar 3px + marginRight 10px)
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 48,
  },
  accentBar: {
    width: 3,
    borderRadius: 4,
    marginRight: 10,
    marginVertical: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  line1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 13,
    color: '#9E9E9E',
  },
  line2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  metaLabel: {
    fontSize: 12,
    color: '#757575',
  },
  undoButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  undoText: {
    fontSize: 13,
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 32,
  },
});
