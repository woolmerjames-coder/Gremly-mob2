import React, { useCallback } from 'react';
import { View, Modal, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, Check } from 'lucide-react-native';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useWorlds, selectWorldPalette, useWorldsForEntity } from '../../lib/store/worldsSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WorldPickerSheetProps = {
  visible: boolean;
  dropId: string;
  dropType: 'todo' | 'habit' | 'note';
  onClose: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WorldPickerSheet({ visible, dropId, dropType, onClose }: WorldPickerSheetProps) {
  const insets = useSafeAreaInsets();

  // Worlds list — subscribe to raw slice so selectWorldPalette has the array
  const worlds = useWorlds();
  const storeWorlds = useGremlyStore((s) => s.worlds);

  // Determine current primary world for highlight
  const worldsForEntity = useWorldsForEntity(dropId);
  const currentWorldId = worldsForEntity[0]?.id ?? null;

  // Filter to assignable phases only
  const activeWorlds = worlds.filter((w) =>
    (['candidate', 'active', 'evolving'] as const).includes(
      w.phase as 'candidate' | 'active' | 'evolving',
    ),
  );

  const handlePickWorld = useCallback(
    async (worldId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
      try {
        await useGremlyStore.getState().pinDropToWorld(dropId, dropType, worldId);
      } catch {
        // Optimistic update already rolled back by the store on error
      }
    },
    [dropId, dropType, onClose],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop tap to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Move to world</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            accessibilityLabel="Close"
          >
            <X size={18} color={BRAND.colors.inkMuted} strokeWidth={2} />
          </Pressable>
        </View>

        {/* World list */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {activeWorlds.map((world) => {
            const palette = selectWorldPalette({ worlds: storeWorlds } as any, world.id);
            const isSelected = world.id === currentWorldId;

            return (
              <Pressable
                key={world.id}
                style={({ pressed }) => [
                  styles.row,
                  isSelected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => handlePickWorld(world.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={world.name}
              >
                <View style={[styles.dot, { backgroundColor: palette.dot }]} />
                <Text
                  style={[styles.worldName, isSelected && styles.worldNameSelected]}
                  numberOfLines={1}
                >
                  {world.name}
                </Text>
                {isSelected && <Check size={15} strokeWidth={2.5} color={BRAND.colors.mossGreen} />}
              </Pressable>
            );
          })}

          {activeWorlds.length === 0 && <Text style={styles.emptyText}>No worlds yet</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  sheet: {
    backgroundColor: BRAND.colors.linenCream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    maxHeight: '70%',
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginBottom: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },

  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    fontFamily: 'Inter-SemiBold',
  },

  closeBtn: {
    padding: 4,
  },

  closeBtnPressed: {
    opacity: 0.5,
  },

  list: {
    flexGrow: 0,
  },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
  },

  rowSelected: {
    backgroundColor: 'rgba(107,142,107,0.10)',
  },

  rowPressed: {
    opacity: 0.65,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },

  worldName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: BRAND.colors.charcoalInk,
    fontFamily: 'Inter-Regular',
  },

  worldNameSelected: {
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    fontFamily: 'Inter-SemiBold',
  },

  emptyText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
