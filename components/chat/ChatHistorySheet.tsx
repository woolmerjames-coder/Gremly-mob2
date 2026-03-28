import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Pressable,
} from 'react-native';
import { MessageSquare, Search } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { today, yesterday, extractLocalDate } from '../../lib/date/DateService';
import type { SpaceChat } from '../../lib/types';

interface ChatHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}

function formatRelativeDate(dateStr: string): string {
  const localDate = extractLocalDate(dateStr);
  if (!localDate) return '';

  if (localDate === today()) return 'Today';
  if (localDate === yesterday()) return 'Yesterday';

  const [, m, d] = localDate.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

export function ChatHistorySheet({ visible, onClose, onSelectChat }: ChatHistorySheetProps) {
  const generalChats = useGremlyStore((s) => s.generalChats);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) {
      useGremlyStore.getState().fetchGeneralChats();
      setSearch('');
    }
  }, [visible]);

  const filtered = search.trim()
    ? generalChats.filter((c) => {
        const q = search.toLowerCase();
        const title = (c.title || '').toLowerCase();
        return title.includes(q);
      })
    : generalChats;

  const renderItem = ({ item }: { item: SpaceChat }) => (
    <TouchableOpacity
      style={styles.historyItem}
      onPress={() => onSelectChat(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <MessageSquare size={18} color="#2E5540" strokeWidth={1.5} />
      </View>
      <View style={styles.contentArea}>
        <Text style={styles.titleStyle} numberOfLines={1}>
          {item.title || 'Conversation'}
        </Text>
        <Text style={styles.metaStyle} numberOfLines={1}>
          {formatRelativeDate(item.updated_at)}
          {item.last_message_snippet ? ` · ${item.last_message_snippet.substring(0, 40)}...` : ''}
        </Text>
      </View>
      <Text style={styles.arrowStyle}>›</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.searchRow}>
            <Search size={16} color="rgba(34,34,34,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search past chats..."
              placeholderTextColor="rgba(34,34,34,0.35)"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No conversations yet</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F9F6F1',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: 16,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#222222',
    padding: 0,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(46,85,64,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentArea: {
    flex: 1,
  },
  titleStyle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#222222',
  },
  metaStyle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(34,34,34,0.55)',
    marginTop: 2,
  },
  arrowStyle: {
    fontFamily: 'Inter-Regular',
    fontSize: 20,
    color: 'rgba(34,34,34,0.3)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(34,34,34,0.4)',
  },
});
