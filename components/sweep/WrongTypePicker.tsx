import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckSquare, FileText, Repeat, Trash2 } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BRAND } from '../../design/brand';

type ItemType = 'todo' | 'note' | 'habit';

type WrongTypePickerProps = {
  visible: boolean;
  currentType: ItemType;
  onSelect: (newType: ItemType | 'delete') => void;
  onClose: () => void;
};

const TYPE_OPTIONS: { key: ItemType; icon: typeof CheckSquare; label: string }[] = [
  { key: 'todo', icon: CheckSquare, label: 'Make it a todo' },
  { key: 'note', icon: FileText, label: 'Make it a note' },
  { key: 'habit', icon: Repeat, label: 'Make it a habit' },
];

export function WrongTypePicker({ visible, currentType, onSelect, onClose }: WrongTypePickerProps) {
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  useEffect(() => {
    const timing = { duration: 150, easing: Easing.out(Easing.cubic) };
    if (visible) {
      scale.value = withTiming(1.0, timing);
      opacity.value = withTiming(1, timing);
    } else {
      scale.value = 0.95;
      opacity.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const filteredOptions = TYPE_OPTIONS.filter((opt) => opt.key !== currentType);

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.positioner}>
        <Animated.View style={[styles.container, animatedStyle]}>
          <Text style={styles.title}>Change to...</Text>

          {filteredOptions.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                style={[styles.option, pressedKey === item.key && styles.optionPressed]}
                onPressIn={() => setPressedKey(item.key)}
                onPressOut={() => setPressedKey(null)}
                onPress={() => onSelect(item.key)}
              >
                <Icon size={16} strokeWidth={2} color={BRAND.colors.mossGreen} />
                <Text style={styles.optionLabel}>{item.label}</Text>
              </Pressable>
            );
          })}

          <View style={styles.divider} />

          <Pressable
            style={[
              styles.option,
              styles.deleteOption,
              pressedKey === 'delete' && styles.optionPressed,
            ]}
            onPressIn={() => setPressedKey('delete')}
            onPressOut={() => setPressedKey(null)}
            onPress={() => onSelect('delete')}
          >
            <Trash2 size={16} strokeWidth={2} color="#C94040" />
            <Text style={[styles.optionLabel, styles.deleteLabel]}>Delete it</Text>
          </Pressable>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  positioner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  container: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.2)',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 2,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionPressed: {
    backgroundColor: 'rgba(191,216,192,0.12)',
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(34,34,34,0.06)',
    marginHorizontal: 14,
    marginTop: 4,
  },
  deleteOption: {
    marginTop: 4,
  },
  deleteLabel: {
    color: '#C94040',
  },
});
