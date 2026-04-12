import React from 'react';
import { View, TextInput, Pressable, StyleSheet, useColorScheme } from 'react-native';
import {
  ArrowLeft,
  Bold,
  Italic,
  List,
  ListOrdered,
  AlignLeft,
  CheckSquare,
} from 'lucide-react-native';
import { Text } from '../../ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BaseType } from './overlayV2.state';
import { ChecklistInput } from './ChecklistInput';

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

export function OverlayExpandedEditor({
  text,
  onChangeText,
  colorMode,
  onCollapse,
  isChecklistMode,
  onToggleChecklistMode,
}: OverlayExpandedEditorProps) {
  const insets = useSafeAreaInsets();

  const toolbarButtons: Array<{ key: string; Icon: typeof Bold; label: string; active?: boolean }> = [
    { key: 'bold', Icon: Bold, label: 'Bold' },
    { key: 'italic', Icon: Italic, label: 'Italic' },
    { key: 'bullet', Icon: List, label: 'Bullet list' },
    { key: 'numbered', Icon: ListOrdered, label: 'Numbered list' },
    { key: 'checklist', Icon: CheckSquare, label: 'Checklist', active: isChecklistMode },
    { key: 'align', Icon: AlignLeft, label: 'Alignment' },
  ];

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onCollapse}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={8}
        >
          <ArrowLeft size={20} color="#6B665C" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Pressable
          onPress={onCollapse}
          style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.85 }]}
          accessibilityLabel="Done"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      {/* Formatting toolbar */}
      <View style={styles.toolbar}>
        {toolbarButtons.map(({ key, Icon, label, active }) => (
          <Pressable
            key={key}
            onPress={key === 'checklist' ? onToggleChecklistMode : undefined}
            style={({ pressed }) => [
              styles.toolbarButton,
              active && styles.toolbarButtonActive,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityLabel={label}
            accessibilityRole="button"
          >
            <Icon
              size={18}
              color={active ? '#2E5540' : '#6B665C'}
            />
          </Pressable>
        ))}
      </View>

      {/* Body */}
      {isChecklistMode ? (
        <View style={styles.bodyContainer}>
          <ChecklistInput text={text} onChangeText={onChangeText} colorMode={colorMode} expanded />
        </View>
      ) : (
        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="Start writing..."
          placeholderTextColor="#B5AFA5"
          multiline
          scrollEnabled
          textAlignVertical="top"
          autoFocus
          style={styles.textInput}
          accessibilityLabel="Expanded content input"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B665C',
  },
  doneButton: {
    backgroundColor: '#2E5540',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E4DC',
  },
  toolbarButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: 'rgba(46, 85, 64, 0.10)',
  },
  bodyContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 28,
    color: '#1A1A1A',
    paddingHorizontal: 16,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
});

export default OverlayExpandedEditor;
