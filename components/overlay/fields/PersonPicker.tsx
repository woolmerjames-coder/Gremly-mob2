import React, { useState, useEffect } from 'react';
import { Modal, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Box, Text, Button } from '../../../ui';
import { useRepo } from '../../../providers/RepoProvider';

export default function PersonPicker({
  value,
  onChange,
  placeholder = 'Select person',
}: {
  value?: { id: string; display: string } | null;
  onChange: (p: { id: string; display: string } | null) => void;
  placeholder?: string;
}) {
  const repo = useRepo();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<any[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    if (!open) return;
    (async () => {
      try {
        const p = await repo.listPeople();
        if (mounted) setPeople(p || []);
      } catch (e) {
        if (__DEV__) console.warn('[PersonPicker] listPeople failed', e);
        if (mounted) setPeople([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, repo]);

  const filtered = people.filter((p) => {
    if (!query) return true;
    const d = (p.display_name || p.email || '').toLowerCase();
    return d.includes(query.toLowerCase());
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => setOpen(true)}
        title={value ? value.display : placeholder}
      />

      <Modal visible={open} transparent animationType="slide">
        <Box style={styles.modalBack}>
          <Box bg="bg" style={styles.sheet}>
            <Text variant="title">Select person</Text>
            <TextInput
              placeholder="Search people"
              value={query}
              onChangeText={setQuery}
              style={styles.search}
              testID="person-picker-search"
            />
            <FlatList
              data={filtered}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onChange({ id: item.id, display: item.display_name || item.email || item.id });
                    setOpen(false);
                  }}
                  style={styles.row}
                  testID={`person-picker-${item.id}`}
                >
                  <Text>{item.display_name || item.email || item.id}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text variant="label">No people</Text>}
              style={{ marginTop: 8 }}
            />

            <Box row mt={3}>
              <Button variant="ghost" onPress={() => setOpen(false)} title="Cancel" />
              <Box flex={1} />
              <Button
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                title="Unassign"
              />
            </Box>
          </Box>
        </Box>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalBack: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    borderRadius: 8,
    padding: 16,
  },
  search: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
});
