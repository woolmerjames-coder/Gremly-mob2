/**
 * YourNotesPopup - Your Notes hub modal for Now page
 * Shows recent logs (past 7 days) with filter tabs and quick capture
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Keyboard,
  Dimensions,
} from 'react-native';

import { useRecentLogs, type LogItem, type LogSubtypeDisplay } from '../../lib/notes/useRecentLogs';
import { YourNotesRow } from './YourNotesRow';

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
  /** Called when user submits quick capture input */
  onCreateNew: (text: string) => void;
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
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {label}
              {count > 0 && ` (${count})`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Capture Input
// ─────────────────────────────────────────────────────────────────────────────
interface QuickCaptureProps {
  onSubmit: (text: string) => void;
}

function QuickCaptureInput({ onSubmit }: QuickCaptureProps) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setText('');
      Keyboard.dismiss();
    }
  }, [text, onSubmit]);

  return (
    <View style={styles.quickCaptureContainer}>
      <Text style={styles.sparkle}>✨</Text>
      <TextInput
        style={styles.quickCaptureInput}
        placeholder="Capture a thought..."
        placeholderTextColor="#999999"
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
        blurOnSubmit
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📝</Text>
      <Text style={styles.emptyTitle}>No notes this week</Text>
      <Text style={styles.emptySubtitle}>Capture thoughts, ideas, or journal entries above</Text>
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
  onCreateNew,
}: YourNotesPopupProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const { logs, journals, ideas, general, loading, totalCount } = useRecentLogs(7);

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
    if (totalCount === 1) return '1 note this week';
    return `${totalCount} notes this week`;
  }, [totalCount]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Overlay */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* Sheet - prevent tap from closing */}
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your Notes</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Capture */}
          <QuickCaptureInput onSubmit={onCreateNew} />

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
              filteredLogs.map((log) => (
                <YourNotesRow key={log.id} log={log} onPress={handleLogPress} />
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: 34, // Safe area
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CHARCOAL_INK,
  },
  closeButton: {
    fontSize: 20,
    color: '#999999',
    fontWeight: '400',
  },
  // Quick Capture
  quickCaptureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
  },
  sparkle: {
    fontSize: 16,
    marginRight: 8,
  },
  quickCaptureInput: {
    flex: 1,
    fontSize: 15,
    color: CHARCOAL_INK,
    paddingVertical: 0,
  },
  // Tabs
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: TAB_INACTIVE_BG,
  },
  tabActive: {
    backgroundColor: TAB_ACTIVE_BG,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: TAB_INACTIVE_TEXT,
  },
  tabTextActive: {
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
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: CHARCOAL_INK,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
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
