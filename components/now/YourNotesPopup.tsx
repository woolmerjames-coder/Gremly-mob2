/**
 * YourNotesPopup - Your Notes hub modal for Now page
 * Shows recent logs (past 7 days) with filter tabs
 *
 * Changes from v1:
 * - Removed quick capture input (use Mind Drop instead)
 * - Added "Past 7 days" subtitle in header
 * - Made filter pills horizontally scrollable
 * - Updated empty state messaging
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { X } from 'lucide-react-native';

import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useRecentNotes } from '../../lib/store/selectors';
import { YourNotesRow } from './YourNotesRow';
import type { Note } from '../../lib/types';
import type { LogItem, LogSubtypeDisplay } from '../../lib/notes/useRecentLogs';

/** Map Note to LogItem for display */
function noteToLogItem(note: Note): LogItem {
  const subtype = note.subtype;
  let logSubtype: LogSubtypeDisplay = 'general';
  if (subtype === 'journal') logSubtype = 'journal';
  else if (subtype === 'idea') logSubtype = 'idea';

  // Map list_items from Note format to LogItem format
  const listItems = note.list_items?.map((item) => ({
    id: item.id,
    label: item.text,
    checked: item.checked,
  }));

  return {
    id: note.id,
    title: note.title || '',
    body: note.body || '',
    logSubtype,
    spaceId: note.space_id ?? undefined,
    isList: note.has_list === true,
    listItems,
    createdAt: note.created_at || '',
    updatedAt: note.updated_at || '',
    tags: note.tags ?? undefined,
    mood: note.mood ?? undefined, // Now typed as string[] | undefined
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Design Tokens
// ─────────────────────────────────────────────────────────────────────────────
const MOSS_GREEN = '#2E5540';
const CHARCOAL_INK = '#222222';
const BORDER_SUBTLE = 'rgba(0,0,0,0.08)';
const TAB_INACTIVE_BG = 'rgba(0,0,0,0.05)';
const TAB_ACTIVE_BG = MOSS_GREEN;
const TAB_ACTIVE_TEXT = '#FFFFFF';
const TAB_INACTIVE_TEXT = '#666666';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'journals' | 'ideas' | 'general';

interface YourNotesPopupProps {
  /** Whether the popup is visible */
  visible: boolean;
  /** Called when user closes the popup (tap overlay or close button) */
  onClose: () => void;
  /** Called when user taps a non-journal log (idea or general) */
  onSelectLog: (log: LogItem) => void;
  /** Called when user taps a journal log (opens full journal view) */
  onSelectJournal: (log: LogItem) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Tabs Component
// ─────────────────────────────────────────────────────────────────────────────
interface FilterTabsProps {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  counts: { all: number; journals: number; ideas: number; general: number };
}

function FilterTabs({ activeTab, onTabChange, counts }: FilterTabsProps) {
  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'journals', label: 'Journals', count: counts.journals },
    { key: 'ideas', label: 'Ideas', count: counts.ideas },
    { key: 'general', label: 'General', count: counts.general },
  ];

  return (
    <View style={styles.tabContainer}>
      {tabs.map(({ key, label, count }) => {
        const isActive = activeTab === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onTabChange(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
            <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>({count})</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No notes yet</Text>
      <Text style={styles.emptySubtitle}>
        Use Mind Drop to capture thoughts, ideas, and reflections
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function YourNotesPopup({
  visible,
  onClose,
  onSelectLog,
  onSelectJournal,
}: YourNotesPopupProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Get recent notes from store (last 7 days worth)
  const recentNotesRaw = useRecentNotes(200);
  const isLoading = useGremlyStore((s) => s.isLoading);
  const spaces = useGremlyStore((s) => s.spaces);

  // Create space lookup map
  const spaceMap = useMemo(() => {
    const map: Record<string, string> = {};
    spaces.forEach((space) => {
      map[space.id] = space.name;
    });
    return map;
  }, [spaces]);

  // Filter to last 7 days and exclude catchall
  const { logs, journals, ideas, general, totalCount } = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString();

    const recentNotes = recentNotesRaw.filter(
      (n) => (n.created_at || '') >= cutoff && n.subtype !== 'catchall',
    );

    const allLogs = recentNotes.map(noteToLogItem);
    const journalLogs = allLogs.filter((l) => l.logSubtype === 'journal');
    const ideaLogs = allLogs.filter((l) => l.logSubtype === 'idea');
    const generalLogs = allLogs.filter((l) => l.logSubtype === 'general');

    return {
      logs: allLogs,
      journals: journalLogs,
      ideas: ideaLogs,
      general: generalLogs,
      totalCount: allLogs.length,
    };
  }, [recentNotesRaw]);

  // Alias for loading state
  const loading = isLoading;

  // Counts for each tab
  const counts = useMemo(
    () => ({
      all: totalCount,
      journals: journals.length,
      ideas: ideas.length,
      general: general.length,
    }),
    [totalCount, journals.length, ideas.length, general.length],
  );

  // Filter logs based on active tab
  const filteredLogs = useMemo(() => {
    switch (activeTab) {
      case 'journals':
        return journals;
      case 'ideas':
        return ideas;
      case 'general':
        return general;
      default:
        return logs;
    }
  }, [activeTab, logs, journals, ideas, general]);

  // Handle log tap - route to correct handler based on subtype
  const handleLogPress = useCallback(
    (log: LogItem) => {
      if (log.logSubtype === 'journal') {
        onSelectJournal(log);
      } else {
        onSelectLog(log);
      }
    },
    [onSelectLog, onSelectJournal],
  );

  // Footer text
  const footerText = useMemo(() => {
    if (totalCount === 0) return '';
    if (totalCount === 1) return '1 note';
    return `${totalCount} notes`;
  }, [totalCount]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Overlay */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* Sheet - prevent tap from closing */}
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Your Notes</Text>
              <Text style={styles.headerSubtitle}>Past 7 days</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.closeButtonContainer}
            >
              <X size={20} color="#999999" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

          {/* Log List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : filteredLogs.length === 0 ? (
              <EmptyState />
            ) : (
              filteredLogs.map((log, index) => (
                <YourNotesRow
                  key={log.id}
                  log={log}
                  onPress={handleLogPress}
                  spaceName={log.spaceId ? spaceMap[log.spaceId] : undefined}
                  isFirst={index === 0}
                />
              ))
            )}
          </ScrollView>

          {/* Footer */}
          {totalCount > 0 && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>{footerText}</Text>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FDF8F3', // Warm cream - Gremly brand
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: SCREEN_HEIGHT * 0.65, // Slightly shorter without input
    paddingBottom: 34, // Safe area
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CHARCOAL_INK,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888888',
    marginTop: 2,
  },
  closeButtonContainer: {
    padding: 4,
    marginTop: 2,
  },
  // Tabs
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: TAB_INACTIVE_BG,
  },
  tabActive: {
    backgroundColor: TAB_ACTIVE_BG,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TAB_INACTIVE_TEXT,
  },
  tabLabelActive: {
    color: TAB_ACTIVE_TEXT,
  },
  tabCount: {
    fontSize: 12,
    fontWeight: '500',
    color: TAB_INACTIVE_TEXT,
    marginTop: 2,
  },
  tabCountActive: {
    color: TAB_ACTIVE_TEXT,
  },
  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  // Loading
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: '#999999',
  },
  // Empty State
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: CHARCOAL_INK,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#999999',
    fontWeight: '500',
  },
});

export default YourNotesPopup;
