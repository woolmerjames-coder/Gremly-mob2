import React from 'react';
import { View, TextInput, Pressable, StyleSheet, useColorScheme, Dimensions } from 'react-native';
import { ChevronDown, CheckSquare } from 'lucide-react-native';
import { Text } from '../../ui';
import { lightTokens, darkTokens } from '../../design/tokens';
import type { BaseType } from './overlayV2.state';
import { ChecklistInput } from './ChecklistInput';

// Max height for text area: 40% of screen height
const SCREEN_HEIGHT = Dimensions.get('window').height;
const TEXT_AREA_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.4);

export type OverlayExpandedEditorProps = {
  baseType: BaseType; // 'log' | 'todo' | 'habit'
  effectiveLogSubtype: 'journal' | 'idea' | 'general' | 'list' | 'event' | null;
  text: string;
  onChangeText: (text: string) => void;
  colorMode: ReturnType<typeof useColorScheme> | 'light' | 'dark' | null;
  isLog: boolean;
  onCollapse: () => void;
  /** Current date/time for journal entries */
  journalDateTime?: Date;
  /** Whether checklist formatting is active (UI-only, applies to any base type) */
  isChecklistMode: boolean;
  /** Callback to toggle checklist mode */
  onToggleChecklistMode: () => void;
};

/**
 * OverlayExpandedEditor - A full-height text editor for the overlay.
 * Provides a larger editing area with collapse functionality.
 *
 * Log subtype selection is handled via the existing chip in UnifiedOverlayV2,
 * not inside this component. We use effectiveLogSubtype for styling/UX tweaks only.
 */
export function OverlayExpandedEditor({
  baseType,
  effectiveLogSubtype,
  text,
  onChangeText,
  colorMode,
  isLog,
  onCollapse,
  journalDateTime,
  isChecklistMode,
  onToggleChecklistMode,
}: OverlayExpandedEditorProps) {
  // Derive label from baseType - Note: 'list' subtype is legacy, checklist mode is separate
  const getLabel = (): string => {
    if (baseType === 'todo') return 'To-Do';
    if (baseType === 'habit') return 'Habit';
    if (isLog && effectiveLogSubtype) {
      if (effectiveLogSubtype === 'journal') return 'Journal';
      if (effectiveLogSubtype === 'idea') return 'Idea';
      // 'list' subtype is legacy - display as 'Note' since checklist is now a separate toggle
    }
    return 'Note';
  };

  const isDark = colorMode === 'dark';
  const tokens = isDark ? darkTokens : lightTokens;

  const isJournalMode = baseType === 'log' && effectiveLogSubtype === 'journal';

  // Current date/time for header
  const currentDateTime = journalDateTime ?? new Date();

  // Format date/time - more expansive for journal, compact for others
  const formatDateTime = (date: Date, isJournal: boolean): string => {
    if (isJournal) {
      // Journal: "Wednesday, December 3 at 2:30 PM"
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      };
      return date.toLocaleDateString('en-US', options).replace(',', ' •');
    }
    // Standard: "Dec 3, 2:30 PM"
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    return date.toLocaleDateString('en-US', options);
  };

  return (
    <View style={styles.container}>
      {/* Header row with collapse button and label */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={onCollapse}
          style={({ pressed }) => [
            styles.collapseButton,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(46, 85, 64, 0.08)',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel="Collapse editor"
          accessibilityRole="button"
        >
          <ChevronDown size={20} color={isDark ? '#FFFFFF' : '#2E5540'} />
        </Pressable>
        <View style={styles.headerTextContainer}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerLabel, { color: isDark ? tokens.colors.text : '#2E5540' }]}>
              {getLabel()}
            </Text>
            {/* Future: Journal "inspire me" icon placeholder */}
            {/* {isJournalMode && (
              <Pressable
                onPress={() => {}}
                style={styles.inspireButton}
                accessibilityLabel="Get writing prompt"
              >
                <Sparkles size={16} color={isDark ? '#7C9885' : '#2E5540'} />
              </Pressable>
            )} */}
          </View>
          {/* Date/time line - shown for all types, emphasized for journal */}
          <Text
            style={[
              isJournalMode ? styles.journalDateTime : styles.standardDateTime,
              {
                color: isJournalMode
                  ? isDark
                    ? 'rgba(255,255,255,0.85)'
                    : 'rgba(46, 85, 64, 0.9)'
                  : isDark
                    ? 'rgba(255,255,255,0.5)'
                    : 'rgba(46, 85, 64, 0.6)',
              },
            ]}
          >
            {formatDateTime(currentDateTime, isJournalMode)}
          </Text>
        </View>
      </View>

      {/* Toolbar area with checklist toggle */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={onToggleChecklistMode}
          style={({ pressed }) => [
            styles.toolbarButton,
            {
              backgroundColor: isChecklistMode
                ? isDark
                  ? 'rgba(124, 152, 133, 0.3)'
                  : 'rgba(46, 85, 64, 0.12)'
                : 'transparent',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel={isChecklistMode ? 'Disable checklist mode' : 'Enable checklist mode'}
          accessibilityRole="button"
        >
          <CheckSquare
            size={18}
            color={
              isChecklistMode
                ? isDark
                  ? '#7C9885'
                  : '#2E5540'
                : isDark
                  ? 'rgba(255,255,255,0.5)'
                  : 'rgba(46, 85, 64, 0.4)'
            }
          />
        </Pressable>
      </View>

      {/* Main editor area - checklist or plain text */}
      {/* Container with maxHeight to prevent overflow */}
      <View style={styles.textAreaContainer}>
        {isChecklistMode ? (
          <ChecklistInput text={text} onChangeText={onChangeText} colorMode={colorMode} expanded />
        ) : (
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder="Add notes..."
            placeholderTextColor={tokens.colors.subtle}
            multiline
            scrollEnabled
            textAlignVertical="top"
            autoFocus
            style={[
              styles.textArea,
              {
                color: tokens.colors.text,
                backgroundColor: isDark ? darkTokens.colors.deep : '#FAFAFA',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEEEEE',
              },
            ]}
            accessibilityLabel="Expanded content input"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Don't use flex: 1 - let content determine size within parent constraints
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  collapseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Journal mode: larger, bolder date for reflective feel
  journalDateTime: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // Standard mode: subtle, smaller date
  standardDateTime: {
    fontSize: 12,
    fontWeight: '400',
  },
  // Placeholder for future inspire button
  inspireButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    minHeight: 32,
  },
  toolbarButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Container to constrain text area height
  textAreaContainer: {
    maxHeight: TEXT_AREA_MAX_HEIGHT,
    minHeight: 150,
  },
  textArea: {
    flex: 1,
    minHeight: 150,
    maxHeight: TEXT_AREA_MAX_HEIGHT,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
});

export default OverlayExpandedEditor;
