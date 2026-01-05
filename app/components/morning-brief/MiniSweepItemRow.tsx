import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BRAND } from '../../../design/brand';
import { useGlobalOverlay } from '../../../contexts/OverlayContext';
import { MiniSweepToggle, MiniSweepPosition } from './MiniSweepToggle';
import type { Todo } from '../../../lib/types';

interface MiniSweepItemRowProps {
  item: Todo;
  value: MiniSweepPosition;
  onChange: (value: MiniSweepPosition) => void;
  isLast?: boolean;
}

export function MiniSweepItemRow({ item, value, onChange, isLast = false }: MiniSweepItemRowProps) {
  const { openEdit } = useGlobalOverlay();

  return (
    <View style={[styles.container, !isLast && styles.borderBottom]}>
      {/* Title row with inline status */}
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => openEdit({ record: item, spaceId: item.space_id ?? null })}
          style={styles.titlePressable}
        >
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.name || 'Untitled'}
          </Text>
        </Pressable>
        <Text style={[styles.statusText, value === 'today' && styles.statusTextToday]}>
          {value === 'archive' && 'bye!'}
          {value === 'defer' && 'see you soon'}
          {value === 'today' && "let's go!"}
        </Text>
      </View>

      {/* Toggle */}
      <View style={styles.toggleContainer}>
        <MiniSweepToggle value={value} onChange={onChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
  },
  titlePressable: {
    flex: 1,
    marginRight: 12,
  },
  statusText: {
    fontSize: 11,
    color: BRAND.colors.inkMuted,
  },
  statusTextToday: {
    color: BRAND.colors.mossGreen,
  },
  toggleContainer: {
    marginTop: 4,
  },
});

export default MiniSweepItemRow;
