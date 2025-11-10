import React from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { normalizeSearchTagInput } from '../../lib/tags/search';

type Props = {
  selected: string[]; // normalized names (#tag, *tag, @person)
  available: string[]; // names
  onChange: (next: string[]) => void;
  tagLoading?: boolean; // tracks initial tag fetch only
  stablePlaceholder?: boolean;
  allowSearch?: boolean;
  testID?: string;
};

export default function TagFilterBar({
  selected,
  available,
  onChange,
  tagLoading,
  stablePlaceholder = true,
  allowSearch = true,
  testID = 'tag-filter-bar',
}: Props) {
  const [input, setInput] = React.useState('');
  const [hasLoadedTags, setHasLoadedTags] = React.useState(() => !tagLoading);
  const isTagLoading = Boolean(tagLoading);

  React.useEffect(() => {
    if (!isTagLoading) {
      setHasLoadedTags(true);
    }
  }, [isTagLoading]);

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

  const placeholder = stablePlaceholder
    ? 'Filter by tag (#anxious, *journal, @alice)'
    : isTagLoading && !hasLoadedTags
      ? 'Loading tags…'
      : 'Filter by tag (#anxious, *journal, @alice)';

  return (
    <View testID={testID} style={styles.root}>
      {selected.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          {selected.map((name) => (
            <TouchableOpacity
              key={name}
              onPress={() => remove(name)}
              style={[styles.chip, styles.chipSelected]}
              testID={`selected-${name}`}
              accessibilityRole="button"
              accessibilityLabel={`Selected tag ${name}, tap to remove`}
            >
              <Text style={styles.chipText}>{name}</Text>
              <Text style={[styles.chipText, { marginLeft: 6 }]}>×</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {allowSearch && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => add(input)}
            returnKeyType="done"
            accessible
            accessibilityLabel="Add a tag to filter"
          />
          <TouchableOpacity
            onPress={() => add(input)}
            disabled={!input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add tag filter"
          >
            <Text style={[styles.addBtn, !input.trim() && { opacity: 0.4 }]}>Add</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        {remaining.map((name) => (
          <TouchableOpacity
            key={name}
            onPress={() => add(name)}
            style={[styles.chip, styles.chipGhost]}
            testID={`available-${name}`}
            accessibilityRole="button"
            accessibilityLabel={`Add tag ${name}`}
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
    height: 40,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  addBtn: { color: '#00695c', fontWeight: '600', padding: 8 },
});
