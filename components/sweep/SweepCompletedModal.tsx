/**
 * SweepCompletedModal Component
 *
 * Modal/bottom sheet that shows the list of items completed since last sweep.
 */

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { BRAND } from '../../design/brand';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CompletedItem {
  id: string;
  name: string;
  type: 'todo' | 'habit' | 'note';
}

interface SweepCompletedModalProps {
  visible: boolean;
  onClose: () => void;
  completedItems: CompletedItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const SweepCompletedModal: React.FC<SweepCompletedModalProps> = ({
  visible,
  onClose,
  completedItems,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Completed since last sweep</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={20} color={BRAND.colors.inkMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {completedItems.length === 0 ? (
              <Text style={styles.emptyText}>No completed items yet</Text>
            ) : (
              completedItems.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemIcon}>
                    <Check size={18} color={BRAND.colors.goldenPear} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemType}>{item.type}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },

  modal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },

  title: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },

  closeButton: {
    padding: 4,
  },

  list: {
    flex: 1,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },

  itemIcon: {
    marginRight: 12,
  },

  itemName: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
  },

  itemType: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    textTransform: 'capitalize',
  },

  emptyText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
});

export default SweepCompletedModal;
