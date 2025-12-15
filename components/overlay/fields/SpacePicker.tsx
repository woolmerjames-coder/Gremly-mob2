import React, { useState } from 'react';
import { Modal, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Box, Text, Button } from '../../../ui';
import { useActiveSpaces } from '../../../lib/store/selectors';

export default function SpacePicker({
  value,
  onChange,
  placeholder = 'Select space',
}: {
  value?: { id: string; display: string } | null; // support same shape as PersonPicker
  onChange: (space: { id: string; display: string } | null) => void;
  placeholder?: string;
}) {
  const spaces = useActiveSpaces();
  const [open, setOpen] = useState(false);

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
            <Text variant="title">Select space</Text>
            <FlatList
              data={spaces}
              keyExtractor={(it) => it.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onChange({ id: item.id, display: item.name || item.id });
                    setOpen(false);
                  }}
                  style={styles.row}
                  testID={`space-picker-${item.id}`}
                >
                  <Text>{item.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text variant="label">No spaces</Text>}
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
                title="Unassigned"
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
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
});
