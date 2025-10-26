import React, { useEffect, useMemo } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  Text,
} from 'react-native';
import { COLORS, RADII, SPACE } from '../_tokens';

type Props = {
  visible: boolean;
  value: string;
  onChange: (text: string) => void;
  onClose: () => void;
  active: 'chats' | 'notes' | 'habits';
  onSetActive: (key: 'chats' | 'notes' | 'habits') => void;
};

export default function SearchOverlay({
  visible,
  value,
  onChange,
  onClose,
  active,
  onSetActive,
}: Props) {
  const y = useMemo(() => new Animated.Value(-60), []);
  const opacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(y, {
          toValue: -60,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, y, opacity]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, { opacity, transform: [{ translateY: y }] }]}
    >
      <View style={styles.inner}>
        <TextInput
          style={styles.input}
          placeholder="Search chats in this Space …"
          placeholderTextColor="rgba(26,51,40,0.5)"
          value={value}
          onChangeText={onChange}
          onBlur={onClose}
          onKeyPress={(e) => {
            // Close on Esc for hardware keyboards
            const key = (e as unknown as { nativeEvent?: { key?: string } })?.nativeEvent?.key;
            if (key === 'Escape') onClose();
          }}
          autoFocus={visible}
        />
        <View style={styles.chips}>
          <Chip label="Chats" active={active === 'chats'} onPress={() => onSetActive('chats')} />
          <Chip label="Notes" active={active === 'notes'} onPress={() => onSetActive('notes')} />
          <Chip label="Habits" active={active === 'habits'} onPress={() => onSetActive('habits')} />
        </View>
      </View>
    </Animated.View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button">
      <View style={[styles.chip, active && styles.chipActive]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    // placed under header; parent should render near top of ScrollView
    zIndex: 10,
  },
  inner: {
    height: 56,
    backgroundColor: 'rgba(249,246,241,0.9)', // Linen @ 90%
    paddingHorizontal: SPACE.md,
    justifyContent: 'center',
    borderBottomLeftRadius: RADII.card,
    borderBottomRightRadius: RADII.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46,85,64,0.1)', // Moss @10%
  },
  input: {
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: RADII.btn,
    paddingHorizontal: 12,
    color: COLORS.Deep,
    letterSpacing: 0.2,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderRadius: RADII.btn,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(26,51,40,0.06)', // Deep @6%
  },
  chipActive: {
    backgroundColor: 'rgba(46,85,64,0.18)', // Moss @18%
  },
  chipText: { color: 'rgba(26,51,40,0.8)', fontWeight: '600', fontSize: 12 },
  chipTextActive: { color: COLORS.Deep },
});
