/**
 * The chat home's chips (lib/chat/homeChips.ts): a row that scrolls sideways,
 * or wraps onto a second line where the room is narrow (beside Gremly) so
 * none is hidden. Tap one to ask Gremly, or to open the day, the wrap up or
 * Gremly's questions, drawn in their own colour with how many wait.
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { CalendarDays, HelpCircle, Moon, Sparkles, Sun, Target } from 'lucide-react-native';
import type { HomeChip, HomeChipIcon, HomeChipKey } from '../../lib/chat/homeChips';

const ICONS: Record<HomeChipIcon, typeof Sun> = {
  sun: Sun,
  calendar: CalendarDays,
  sparkles: Sparkles,
  target: Target,
  moon: Moon,
  question: HelpCircle,
};

export type HomeChipsProps = {
  chips: HomeChip[];
  onPress: (key: HomeChipKey) => void;
  style?: StyleProp<ViewStyle>;
  /** Wrap onto a second line instead of scrolling, so every chip is in view */
  wrap?: boolean;
};

export function HomeChips({ chips, onPress, style, wrap = false }: HomeChipsProps) {
  if (!chips.length) return null;
  const items = chips.map((chip) => {
    const Icon = ICONS[chip.icon];
    const asks = chip.count != null;
    return (
      <Pressable
        key={chip.key}
        onPress={() => onPress(chip.key)}
        style={({ pressed }) => [
          styles.chip,
          chip.evening && styles.chipEvening,
          asks && styles.chipQuestions,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={asks ? `${chip.label}, ${chip.count} waiting` : chip.label}
        testID={`home-chip-${chip.key}`}
      >
        <Icon
          size={16}
          color={asks ? '#4A4E7A' : chip.evening ? '#4A5486' : '#3C6150'}
          strokeWidth={2}
        />
        <Text
          style={[styles.label, chip.evening && styles.labelEvening, asks && styles.labelQuestions]}
        >
          {chip.label}
        </Text>
        {asks ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{chip.count}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  });
  if (wrap)
    return (
      <View style={[styles.wrap, style]} testID="home-chips">
        {items}
      </View>
    );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={style}
      contentContainerStyle={styles.row}
      testID="home-chips"
    >
      {items}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE6DB',
    backgroundColor: '#EEF3ED',
  },
  chipEvening: { borderColor: '#D9DCEA', backgroundColor: '#EEF0F6' },
  pressed: { opacity: 0.75 },
  label: { fontFamily: 'Inter-Medium', fontSize: 14, color: '#2E4A3A' },
  labelEvening: { color: '#3B4472' },
  chipQuestions: { borderColor: 'rgba(74,78,122,0.30)', backgroundColor: '#ECEEFA' },
  labelQuestions: { color: '#2B2F55' },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#4A4E7A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF' },
});
