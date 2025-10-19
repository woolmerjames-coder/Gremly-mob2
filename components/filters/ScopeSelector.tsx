import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import Chip from '../ui/Chip';

export type ScopeOption =
  | { kind: 'everywhere'; label: string }
  | { kind: 'space'; id: string; label: string; icon?: React.ReactNode }
  | { kind: 'unassigned'; label: string };

type ScopeSelectorProps = {
  spaces: { id: string; name: string; icon?: React.ReactNode }[];
  value: ScopeOption; // currently selected scope
  onChange: (next: ScopeOption) => void;
  testID?: string;
};

export default function ScopeSelector({ spaces, value, onChange, testID }: ScopeSelectorProps) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => {
    if (value.kind === 'everywhere') return 'Everywhere ▾';
    if (value.kind === 'unassigned') return 'Unassigned only ▾';
    return `${value.label} ▾`;
  }, [value]);

  const data: (ScopeOption | { kind: 'divider' })[] = useMemo(() => {
    const base: (ScopeOption | { kind: 'divider' })[] = [
      { kind: 'everywhere', label: 'Everywhere' },
      { kind: 'divider' as const },
      ...spaces.map((s) => ({ kind: 'space' as const, id: s.id, label: s.name, icon: s.icon })),
      { kind: 'divider' as const },
      { kind: 'unassigned', label: 'Unassigned only' },
    ];
    return base;
  }, [spaces]);

  return (
    <View style={styles.wrap}>
      <Chip
        testID={testID ?? 'scope-selector'}
        label={label}
        onPress={() => setOpen(true)}
        selected={value.kind !== 'everywhere'}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} testID="scope-backdrop" />
        <View style={styles.sheet} testID="scope-sheet">
          <FlatList
            data={data}
            keyExtractor={(_, idx) => String(idx)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              if (item.kind === 'divider') return <View style={styles.divider} />;
              const opt = item;
              const selected =
                (value.kind === 'everywhere' && opt.kind === 'everywhere') ||
                (value.kind === 'unassigned' && opt.kind === 'unassigned') ||
                (value.kind === 'space' && opt.kind === 'space' && value.id === opt.id);

              return (
                <Pressable
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  testID={
                    opt.kind === 'space'
                      ? `scope-option-space-${opt.id}`
                      : opt.kind === 'everywhere'
                        ? 'scope-option-everywhere'
                        : 'scope-option-unassigned'
                  }
                >
                  {opt.kind === 'space' && opt.icon ? (
                    <View style={styles.icon}>{opt.icon}</View>
                  ) : null}
                  <Text style={styles.rowText}>{opt.label}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 100,
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 8,
    // shadow
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  row: { paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  rowSelected: { backgroundColor: 'rgba(0,0,0,0.04)' },
  rowText: { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  sep: { height: 4 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 6 },
  icon: { marginRight: 8 },
});
