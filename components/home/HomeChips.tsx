/**
 * The chat home's chips (lib/chat/homeChips.ts), a row that scrolls sideways
 * above the box: tap one to ask Gremly, or to open the day or the wrap up.
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { CalendarDays, Moon, Sparkles, Sun, Target } from 'lucide-react-native';
import type { HomeChip, HomeChipIcon, HomeChipKey } from '../../lib/chat/homeChips';

const ICONS: Record<HomeChipIcon, typeof Sun> = {
  sun: Sun,
  calendar: CalendarDays,
  sparkles: Sparkles,
  target: Target,
  moon: Moon,
};

export type HomeChipsProps = {
  chips: HomeChip[];
  onPress: (key: HomeChipKey) => void;
  style?: StyleProp<ViewStyle>;
};

export function HomeChips({ chips, onPress, style }: HomeChipsProps) {
  if (!chips.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={style}
      contentContainerStyle={styles.row}
      testID="home-chips"
    >
      {chips.map((chip) => {
        const Icon = ICONS[chip.icon];
        return (
          <Pressable
            key={chip.key}
            onPress={() => onPress(chip.key)}
            style={({ pressed }) => [
              styles.chip,
              chip.evening && styles.chipEvening,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            testID={`home-chip-${chip.key}`}
          >
            <Icon size={16} color={chip.evening ? '#4A5486' : '#3C6150'} strokeWidth={2} />
            <Text style={[styles.label, chip.evening && styles.labelEvening]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 4 },
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
});
