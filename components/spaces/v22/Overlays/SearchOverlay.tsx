import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import { X as CloseIcon } from 'lucide-react-native';

export type SearchOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

const FILTERS = ['Chats', 'Notes', 'To-Dos', 'Habits'] as const;
export type FilterKey = (typeof FILTERS)[number];

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ visible, onClose }) => {
  const opacity = React.useMemo(() => new Animated.Value(0), []);
  const translateY = React.useMemo(() => new Animated.Value(-16), []);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState<Record<FilterKey, boolean>>({
    Chats: true,
    Notes: true,
    'To-Dos': true,
    Habits: true,
  });

  React.useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      translateY.setValue(-16);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10,
        onPanResponderMove: (_e, g) => {
          if (g.dy < 0) {
            // slight upward resistance
            translateY.setValue(Math.max(-24, g.dy));
          }
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -40) {
            onClose();
          } else {
            Animated.timing(translateY, {
              toValue: 0,
              duration: 120,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [onClose, translateY],
  );

  const toggle = (key: FilterKey) => {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.cardWrap, { opacity, transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Search</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close search"
              >
                <CloseIcon color={COLORS.Deep} size={20} />
              </TouchableOpacity>
            </View>

            <View style={{ height: 12 }} />

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats, notes, or actions in this Space."
              placeholderTextColor="#5A6D60"
              style={styles.input}
              autoFocus
              accessibilityLabel="Search space"
              testID="search-overlay-input"
            />

            <View style={{ height: 10 }} />

            <View style={styles.chipsRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => toggle(f)}
                  accessibilityRole="button"
                  style={[styles.chip, active[f] ? styles.chipOn : styles.chipOff]}
                >
                  <Text
                    style={[styles.chipText, active[f] ? styles.chipTextOn : styles.chipTextOff]}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 12 }} />
            <Text style={styles.hint}>Swipe up to close</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.20)', // Deep glass underlay
  },
  cardWrap: {
    marginTop: 64, // appear just below header band
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: 'rgba(249,246,241,0.90)', // Linen @ 90%
    padding: SPACE.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.Deep,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1F2E27',
    borderWidth: 1,
    borderColor: 'rgba(21,51,38,0.18)',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  chipOn: {
    backgroundColor: '#E6EDE7',
    borderColor: '#ADC6B0',
  },
  chipOff: {
    backgroundColor: 'transparent',
    borderColor: '#C6D6C9',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextOn: {
    color: '#1F2E27',
  },
  chipTextOff: {
    color: '#5A6D60',
  },
  hint: {
    textAlign: 'center',
    color: '#5A6D60',
    fontSize: 12,
  },
});

export default SearchOverlay;
