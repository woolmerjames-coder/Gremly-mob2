import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import { X as CloseIcon } from 'lucide-react-native';

export type TimelineOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

export const TimelineOverlay: React.FC<TimelineOverlayProps> = ({ visible, onClose }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Timeline</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close timeline"
            >
              <CloseIcon color={COLORS.Linen} size={22} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 12 }} />
          <View style={styles.placeholderList}>
            {['08:00 — Morning notes', '13:30 — Standup reflections', '18:15 — Plan tomorrow'].map(
              (t, i) => (
                <View key={i} style={styles.itemRow}>
                  <View style={styles.dot} />
                  <Text style={styles.itemText}>{t}</Text>
                </View>
              ),
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.32)', // Deep with transparency
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.Deep,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACE.lg,
    paddingBottom: SPACE.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.Linen,
  },
  placeholderList: {
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.Pear,
  },
  itemText: {
    color: '#D9E6DA',
    fontSize: 14,
  },
});

export default TimelineOverlay;
