/**
 * YourNotesPopup - Your Notes hub modal for Now page
 * Shows recent logs (past 7 days) with filter tabs and quick capture
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

import { useRecentLogs, type LogItem } from '../../lib/notes/useRecentLogs';
import { YourNotesRow } from './YourNotesRow';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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
const COLLAPSED_BG = '#F5F5F3';
const TYPE_PILL_ACTIVE_BG = 'rgba(46, 85, 64, 0.12)';
const TYPE_PILL_INACTIVE_BG = 'rgba(0,0,0,0.04)';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'journals' | 'ideas' | 'general';
type NoteType = 'journal' | 'idea' | 'general';

interface YourNotesPopupProps {
  /** Whether the popup is visible */
  visible: boolean;
  /** Called when user closes the popup (tap overlay or close button) */
  onClose: () => void;
  /** Called when user taps a non-journal log (idea or general) */
  onSelectLog: (log: LogItem) => void;
  /** Called when user taps a journal log (opens full journal view) */
  onSelectJournal: (log: LogItem) => void;
  /** Called when user submits quick capture input with type */
  onCreateNew: (text: string, noteType: NoteType, isList: boolean) => void;
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
// Type Selector Pills
// ─────────────────────────────────────────────────────────────────────────────
interface TypeSelectorProps {
  selectedType: NoteType;
  onTypeChange: (type: NoteType) => void;
}

function TypeSelector({ selectedType, onTypeChange }: TypeSelectorProps) {
  const types: { key: NoteType; icon: string; label: string }[] = [
    { key: 'journal', icon: '📓', label: 'Journal' },
    { key: 'idea', icon: '💡', label: 'Idea' },
    { key: 'general', icon: '📝', label: 'General' },
  ];

  return (
    <View style={styles.typeSelectorContainer}>
      {types.map(({ key, icon, label }) => {
        const isActive = selectedType === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.typePill, isActive && styles.typePillActive]}
            onPress={() => onTypeChange(key)}
            activeOpacity={0.7}
          >
            <Text style={styles.typePillIcon}>{icon}</Text>
            <Text style={[styles.typePillText, isActive && styles.typePillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expandable Quick Capture Input
// ─────────────────────────────────────────────────────────────────────────────
interface QuickCaptureProps {
  onSubmit: (text: string, noteType: NoteType, isList: boolean) => void;
  onExpandChange?: (isExpanded: boolean) => void;
}

function QuickCaptureInput({ onSubmit, onExpandChange }: QuickCaptureProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [text, setText] = useState('');
  const [selectedType, setSelectedType] = useState<NoteType>('general');
  const [isList, setIsList] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(true);
    onExpandChange?.(true);
    // Focus input after animation
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, [onExpandChange]);

  const handleCollapse = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(false);
    setText('');
    setSelectedType('general');
    setIsList(false);
    Keyboard.dismiss();
    onExpandChange?.(false);
  }, [onExpandChange]);

  const handleSave = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed) {
      onSubmit(trimmed, selectedType, isList);
      handleCollapse();
    }
  }, [text, selectedType, isList, onSubmit, handleCollapse]);

  const canSave = text.trim().length > 0;

  // Collapsed state
  if (!isExpanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedContainer}
        onPress={handleExpand}
        activeOpacity={0.7}
      >
        <Text style={styles.sparkle}>✨</Text>
        <Text style={styles.collapsedPlaceholder}>Capture a thought...</Text>
      </TouchableOpacity>
    );
  }

  // Expanded state
  return (
    <View style={styles.expandedContainer}>
      {/* Text Input Area */}
      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          style={styles.expandedInput}
          placeholder="What's on your mind?"
          placeholderTextColor="#999999"
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          autoFocus
        />
      </View>

      {/* Type Selector */}
      <TypeSelector selectedType={selectedType} onTypeChange={setSelectedType} />

      {/* List Toggle */}
      <TouchableOpacity
        style={styles.listToggle}
        onPress={() => setIsList(!isList)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isList && styles.checkboxChecked]}>
          {isList && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.listToggleText}>Make it a list</Text>
      </TouchableOpacity>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCollapse} activeOpacity={0.7}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          activeOpacity={canSave ? 0.7 : 1}
          disabled={!canSave}
        >
          <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
            Save
          </Text>
        </TouchableOpacity>
      </View>
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
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const { logs, journals, ideas, general, loading, totalCount, reload } = useRecentLogs(7);

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

  // Handle quick capture submit
  const handleQuickCaptureSubmit = useCallback(
    (text: string, noteType: NoteType, isList: boolean) => {
      onCreateNew(text, noteType, isList);
      // Reload logs to show new entry
      reload();
    },
    [onCreateNew, reload],
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
          <QuickCaptureInput
            onSubmit={handleQuickCaptureSubmit}
            onExpandChange={setIsInputExpanded}
          />

          {/* Filter Tabs - hide when input is expanded */}
          {!isInputExpanded && (
            <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
          )}

          {/* Log List - hide when input is expanded */}
          {!isInputExpanded && (
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
          )}

          {/* Footer - hide when input is expanded */}
          {!isInputExpanded && totalCount > 0 && (
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
  // Collapsed Quick Capture
  collapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLLAPSED_BG,
  },
  sparkle: {
    fontSize: 16,
    marginRight: 8,
  },
  collapsedPlaceholder: {
    fontSize: 15,
    color: '#888888',
  },
  // Expanded Quick Capture
  expandedContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    // Shadow for lifted appearance
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
    marginBottom: 12,
  },
  expandedInput: {
    fontSize: 15,
    color: CHARCOAL_INK,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 80,
    maxHeight: 120,
  },
  // Type Selector
  typeSelectorContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: TYPE_PILL_INACTIVE_BG,
  },
  typePillActive: {
    backgroundColor: TYPE_PILL_ACTIVE_BG,
  },
  typePillIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  typePillText: {
    fontSize: 13,
    fontWeight: '500',
    color: TAB_INACTIVE_TEXT,
  },
  typePillTextActive: {
    color: MOSS_GREEN,
    fontWeight: '600',
  },
  // List Toggle
  listToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: MOSS_GREEN,
    borderColor: MOSS_GREEN,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  listToggleText: {
    fontSize: 14,
    color: CHARCOAL_INK,
  },
  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666666',
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: MOSS_GREEN,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: '#FFFFFF',
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
