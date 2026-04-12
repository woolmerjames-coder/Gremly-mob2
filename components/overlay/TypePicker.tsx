/**
 * TypePicker — Dropdown picker for entity types
 *
 * Replaces the Note/To-Do/Habit segmented control with a compact pill
 * that opens a dropdown with all 6 types.
 */

import React from 'react';
import { Pressable, View, Modal, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../../ui';
import type { BaseType, LogSubtypeOverride } from './overlayV2.state';

export type OverlayEntityType = 'todo' | 'habit' | 'event' | 'idea' | 'journal' | 'general';

interface TypeConfig {
  id: OverlayEntityType;
  label: string;
  color: string;
  baseType: BaseType;
  logSubtype: LogSubtypeOverride | null;
}

export const ENTITY_TYPES: TypeConfig[] = [
  { id: 'todo', label: 'To-Do', color: '#2E5540', baseType: 'todo', logSubtype: null },
  { id: 'habit', label: 'Habit', color: '#2E5540', baseType: 'habit', logSubtype: null },
  { id: 'event', label: 'Event', color: '#6B4C8A', baseType: 'log', logSubtype: 'event' },
  { id: 'idea', label: 'Idea', color: '#B8860B', baseType: 'log', logSubtype: 'idea' },
  { id: 'journal', label: 'Journal', color: '#8B5E3C', baseType: 'log', logSubtype: 'journal' },
  { id: 'general', label: 'General', color: '#6B665C', baseType: 'log', logSubtype: 'general' },
];

/** Derive the OverlayEntityType from baseType + logSubtype */
export function deriveEntityType(baseType: BaseType, logSubtype?: LogSubtypeOverride | string | null): OverlayEntityType {
  if (baseType === 'todo') return 'todo';
  if (baseType === 'habit') return 'habit';
  if (logSubtype === 'event') return 'event';
  if (logSubtype === 'idea') return 'idea';
  if (logSubtype === 'journal') return 'journal';
  return 'general';
}

/** Get the TypeConfig for a given entity type */
export function getTypeConfig(type: OverlayEntityType): TypeConfig {
  return ENTITY_TYPES.find(t => t.id === type) ?? ENTITY_TYPES[5]; // default to general
}

interface TypePillProps {
  type: OverlayEntityType;
  onPress: () => void;
  testID?: string;
}

/** The small pill that shows current type — tap to open picker */
export const TypePill: React.FC<TypePillProps> = ({ type, onPress, testID }) => {
  const config = getTypeConfig(type);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: `${config.color}10` },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Type: ${config.label}. Tap to change.`}
      testID={testID}
    >
      <Text style={[styles.pillText, { color: config.color }]}>{config.label}</Text>
    </Pressable>
  );
};

interface TypePickerDropdownProps {
  visible: boolean;
  current: OverlayEntityType;
  onSelect: (type: OverlayEntityType) => void;
  onClose: () => void;
}

/** Dropdown that appears when pill is tapped */
export const TypePickerDropdown: React.FC<TypePickerDropdownProps> = ({
  visible,
  current,
  onSelect,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.dropdown}>
          {ENTITY_TYPES.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                onSelect(t.id);
                onClose();
              }}
              style={({ pressed }) => [
                styles.option,
                t.id === current && styles.optionActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              {t.id === current && <Check size={13} color={t.color} />}
              <Text
                style={[
                  styles.optionText,
                  { color: t.id === current ? t.color : '#1a1a1a' },
                  t.id === current && { fontWeight: '600' },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minHeight: 32,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 20,
  },
  dropdown: {
    backgroundColor: '#F5F2EB',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#D5D0C8',
    padding: 4,
    minWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
  },
  optionActive: {
    backgroundColor: 'rgba(46, 85, 64, 0.06)',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '400',
  },
});
