import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Check, X } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { lightTokens } from '../../design/tokens';
import type { ExtractedListItem } from '../../lib/lists';

interface TodoPreviewModalProps {
  visible: boolean;
  items: ExtractedListItem[];
  spaceName: string;
  spaceId: string;
  onConfirm: (selectedItems: ExtractedListItem[]) => void;
  onCancel: () => void;
}

export function TodoPreviewModal({
  visible,
  items,
  spaceName,
  spaceId: _spaceId,
  onConfirm,
  onCancel,
}: TodoPreviewModalProps) {
  // Initialize selection with actionable items
  // Resets when items change (which happens when a different note is selected)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const actionableIds = items.filter((item) => item.isActionable).map((item) => item.id);
    return new Set(actionableIds);
  });

  // Track items to detect when they change and reset selection
  const itemsKey = items.map((i) => i.id).join(',');
  const [prevItemsKey, setPrevItemsKey] = useState(itemsKey);

  // This is the pattern React recommends for resetting state based on props
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (itemsKey !== prevItemsKey) {
    setPrevItemsKey(itemsKey);
    const actionableIds = items.filter((item) => item.isActionable).map((item) => item.id);
    setSelectedIds(new Set(actionableIds));
  }

  const selectedCount = selectedIds.size;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedItems = items.filter((item) => selectedIds.has(item.id));
    onConfirm(selectedItems);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.closeButton}>
            <X size={24} color={lightTokens.colors.charcoalInk} />
          </Pressable>
          <Text style={styles.title}>Create Todos</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>Select items to convert into tasks:</Text>

        {/* Items list */}
        <ScrollView style={styles.scrollView}>
          {items.map((item, index) => (
            <Animated.View key={item.id} entering={FadeIn.delay(index * 30)}>
              <Pressable
                onPress={() => toggleItem(item.id)}
                style={[styles.itemRow, selectedIds.has(item.id) && styles.itemRowSelected]}
              >
                <View
                  style={[styles.checkbox, selectedIds.has(item.id) && styles.checkboxSelected]}
                >
                  {selectedIds.has(item.id) && <Check size={14} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={[styles.itemText, !item.isActionable && styles.itemTextNonActionable]}>
                  {item.text}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} will be added to{' '}
            <Text style={styles.spaceName}>{spaceName}</Text>
          </Text>

          <View style={styles.buttonRow}>
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              style={[styles.confirmButton, selectedCount === 0 && styles.confirmButtonDisabled]}
              disabled={selectedCount === 0}
            >
              <Text style={styles.confirmButtonText}>
                Create {selectedCount > 0 ? `${selectedCount} ` : ''}Tasks
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: lightTokens.colors.charcoalInk,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#F8F6F0',
  },
  itemRowSelected: {
    backgroundColor: 'rgba(107, 142, 107, 0.15)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: lightTokens.colors.mossGreen,
    borderColor: lightTokens.colors.mossGreen,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    color: lightTokens.colors.charcoalInk,
  },
  itemTextNonActionable: {
    color: '#999',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  spaceName: {
    fontWeight: '600',
    color: lightTokens.colors.mossGreen,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: lightTokens.colors.mossGreen,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
