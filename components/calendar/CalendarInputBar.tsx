/**
 * CalendarInputBar — natural-language input bar fixed at the bottom
 * of CalendarScreen.  Creates drops via MindDrop pipeline with the
 * selected calendar date pre-filled as `prefillDate`.
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Plus, Send } from 'lucide-react-native';
import { getDateService } from '../../lib/date';
import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayNameFromDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

export interface CalendarInputBarProps {
  selectedDate: string; // YYYY-MM-DD from WeekStrip
}

export default function CalendarInputBar({ selectedDate }: CalendarInputBarProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { submit, isSubmitting } = useMindDropSubmit();

  const dayName = dayNameFromDate(selectedDate);
  const isToday = selectedDate === getDateService().today();
  const placeholder = isToday ? 'Add to today...' : `Add to ${dayName}...`;

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    setText('');
    Keyboard.dismiss();

    await submit(trimmed, {
      source: 'minddrop',
      prefillDate: selectedDate,
    });
  }, [text, isSubmitting, submit, selectedDate]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Plus size={20} color="#999" />
        </View>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#B0ACA6"
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={handleSubmit}
        />

        {text.trim().length > 0 && (
          <Pressable
            onPress={handleSubmit}
            style={styles.sendBtn}
            hitSlop={8}
            disabled={isSubmitting}
          >
            <Send size={18} color="#fff" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3EF',
    borderRadius: 24,
    height: 40,
    paddingHorizontal: 12,
  },
  iconWrap: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#2D2D2D',
    paddingVertical: 0,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#6B8F71',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
