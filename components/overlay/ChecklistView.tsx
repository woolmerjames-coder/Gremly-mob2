import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { lightTokens } from '../../design/tokens';
import type { ListItem } from '../../lib/lists';

interface ChecklistViewProps {
  items: ListItem[];
  onToggle: (itemId: string) => void;
  readOnly?: boolean;
}

export function ChecklistView({ items, onToggle, readOnly = false }: ChecklistViewProps) {
  const handleToggle = (itemId: string) => {
    if (readOnly) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(itemId);
  };

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <Animated.View key={item.id} entering={FadeIn.delay(index * 50)} style={styles.itemRow}>
          <Pressable
            onPress={() => handleToggle(item.id)}
            style={[styles.checkbox, item.checked && styles.checkboxChecked]}
            disabled={readOnly}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
            accessibilityLabel={item.text}
          >
            {item.checked && <Check size={14} color="#fff" strokeWidth={3} />}
          </Pressable>
          <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>{item.text}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: lightTokens.colors.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: lightTokens.colors.mossGreen,
    borderColor: lightTokens.colors.mossGreen,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: lightTokens.colors.charcoalInk,
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
});
