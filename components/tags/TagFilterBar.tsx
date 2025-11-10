import React from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { normalizeSearchTagInput } from '../../lib/tags/search';

type Props = {
  selected: string[]; // normalized names (#tag, *tag, @person)
  available: string[]; // names
  onChange: (next: string[]) => void;
  loading?: boolean;
  allowSearch?: boolean;
  testID?: string;
};

export default function TagFilterBar({
  selected,
  available,
  onChange,
  loading,
  allowSearch = true,
  testID = 'tag-filter-bar',
}: Props) {
  const [input, setInput] = React.useState('');

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const remaining = React.useMemo(
    () => available.filter((t) => !selectedSet.has(t)),
    [available, selectedSet],
  );

  const add = (raw: string) => {
    const norm = normalizeSearchTagInput(raw);
    if (!norm) return;
    if (!selectedSet.has(norm)) {
      onChange([...selected, norm]);
    }
    setInput('');
  };

  const remove = (name: string) => {
    onChange(selected.filter((t) => t !== name));
  };

  return (
    <View testID={testID} style={styles.root}>
      {/* Selected */}
      {selected.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          {selected.map((name) => (
            <TouchableOpacity
              key={name}
              onPress={() => remove(name)}
              style={[styles.chip, styles.chipSelected]}
              testID={`selected-${name}`}
            >
              <Text style={styles.chipText}>{name}</Text>
              <Text style={[styles.chipText, { marginLeft: 6 }]}>×</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      {allowSearch && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={loading ? 'Loading tags…' : 'Filter by tag (#anxious, *journal, @alice)'}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => add(input)}
            returnKeyType="done"
            editable={!loading}
          />
          <TouchableOpacity onPress={() => add(input)} disabled={!input.trim() || loading}>
            <Text style={styles.addBtn}>Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Available */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        {remaining.map((name) => (
          <TouchableOpacity
            key={name}
            onPress={() => add(name)}
            style={[styles.chip, styles.chipGhost]}
            testID={`available-${name}`}
          >
            <Text style={styles.chipGhostText}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, marginBottom: 8 },
  row: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    backgroundColor: '#eceff1',
  },
  chipSelected: { backgroundColor: '#c8e6c9', borderColor: '#81c784' },
  chipText: { fontSize: 12, color: '#234' },
  chipGhost: { backgroundColor: 'transparent', borderColor: '#cfd8dc' },
  chipGhostText: { fontSize: 12, color: '#567' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  addBtn: { color: '#00695c', fontWeight: '600', padding: 8 },
});
