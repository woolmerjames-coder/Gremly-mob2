import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Search, X, XCircle, RefreshCw, FileText, CheckSquare, Users } from 'lucide-react-native';
import { searchIndex, SearchableMessage } from '../../lib/chat/searchIndex';
import { formatDistanceToNow } from 'date-fns';

interface MessageSearchProps {
  visible: boolean;
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}

export function MessageSearch({ visible, onClose, onSelectMessage }: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableMessage[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);

      if (text.length < 2) {
        setResults([]);
        return;
      }

      const searchResults = searchIndex.search(text, {
        type: filter || undefined,
      });

      setResults(searchResults);
    },
    [filter],
  );

  const filters = [
    { id: null, label: 'All', icon: Search },
    { id: 'habit', label: 'Habits', icon: RefreshCw },
    { id: 'note', label: 'Notes', icon: FileText },
    { id: 'task', label: 'Tasks', icon: CheckSquare },
    { id: 'person', label: 'People', icon: Users },
  ];

  const renderResult = ({ item }: { item: SearchableMessage }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => {
        onSelectMessage(item.id);
        onClose();
      }}
    >
      <View style={styles.resultHeader}>
        {item.type && <Text style={styles.resultType}>{item.type.toUpperCase()}</Text>}
        <Text style={styles.resultTime}>
          {formatDistanceToNow(item.timestamp, { addSuffix: true })}
        </Text>
      </View>
      <Text style={styles.resultContent} numberOfLines={2}>
        {item.content}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Search Messages</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchBar}>
          <Search size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for habits, notes, tasks..."
            value={query}
            onChangeText={handleSearch}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <XCircle size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {filters.map((f) => {
              const IconComponent = f.icon;
              return (
                <TouchableOpacity
                  key={f.id || 'all'}
                  style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
                  onPress={() => {
                    setFilter(f.id);
                    handleSearch(query);
                  }}
                >
                  <IconComponent size={16} color={filter === f.id ? '#FFF' : '#666'} />
                  <Text style={[styles.filterLabel, filter === f.id && styles.filterLabelActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {results.length > 0 ? (
          <FlatList
            data={results}
            renderItem={renderResult}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.results}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : query.length > 1 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No results found</Text>
            <Text style={styles.emptySubtext}>Try different keywords</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Search size={48} color="#CCC" />
            <Text style={styles.emptyText}>Start typing to search</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 16,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  filters: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#2E5540',
    borderColor: '#2E5540',
  },
  filterLabel: {
    marginLeft: 4,
    fontSize: 14,
    color: '#666',
  },
  filterLabelActive: {
    color: '#FFF',
  },
  results: {
    padding: 16,
  },
  resultItem: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  resultType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E5540',
  },
  resultTime: {
    fontSize: 11,
    color: '#999',
  },
  resultContent: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  separator: {
    height: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
});
