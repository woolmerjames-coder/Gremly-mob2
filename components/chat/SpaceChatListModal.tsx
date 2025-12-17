import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MessageSquare, Plus, X, MoreVertical } from '../icons';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useSpaceChats } from '../../lib/store/selectors';
import { SpaceChat } from '../../lib/types';
import { getRelativeTime } from '../../lib/utils/getRelativeTime';

interface SpaceChatListModalProps {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

export function SpaceChatListModal({
  visible,
  onClose,
  spaceId,
  spaceName,
  onSelectChat,
  onNewChat,
}: SpaceChatListModalProps) {
  const chats = useSpaceChats(spaceId);
  const isLoading = useGremlyStore((s) => s.isLoading);
  const deleteSpaceChat = useGremlyStore((s) => s.deleteSpaceChat);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      onClose();
      onSelectChat(chatId);
    },
    [onClose, onSelectChat],
  );

  const handleNewChat = useCallback(() => {
    onClose();
    onNewChat();
  }, [onClose, onNewChat]);

  const handleDeleteChat = useCallback(
    (chatId: string, chatTitle: string | null) => {
      Alert.alert('Delete Chat', `Are you sure you want to delete "${chatTitle || 'this chat'}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSpaceChat(chatId);
            } catch (err) {
              console.error('[SpaceChatListModal] Failed to delete chat:', err);
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]);
    },
    [deleteSpaceChat],
  );

  const renderChatItem = useCallback(
    ({ item }: { item: SpaceChat }) => (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => handleSelectChat(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.chatIcon}>
          <MessageSquare size={20} color="#5C6B5A" />
        </View>
        <View style={styles.chatContent}>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {item.title || 'Untitled Chat'}
          </Text>
          {item.last_message_snippet && (
            <Text style={styles.chatSnippet} numberOfLines={1}>
              {item.last_message_snippet}
            </Text>
          )}
        </View>
        <Text style={styles.chatDate}>{getRelativeTime(item.updated_at)}</Text>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => handleDeleteChat(item.id, item.title)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreVertical size={18} color="#999" />
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    [handleSelectChat, handleDeleteChat],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Space Chats</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* New Chat Button */}
        <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat} activeOpacity={0.8}>
          <Plus size={22} color="#fff" />
          <Text style={styles.newChatButtonText}>Start New Chat</Text>
        </TouchableOpacity>

        {/* Chat List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#5C6B5A" />
          </View>
        ) : chats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MessageSquare size={48} color="#ccc" />
            <Text style={styles.emptyText}>No chats yet</Text>
            <Text style={styles.emptySubtext}>
              Start a conversation with Gremly about {spaceName}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Recent</Text>
            <FlatList
              data={chats}
              keyExtractor={(item) => item.id}
              renderItem={renderChatItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F7F4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C6B5A',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  newChatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  chatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
    marginRight: 8,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  chatSnippet: {
    fontSize: 13,
    color: '#888',
  },
  chatDate: {
    fontSize: 12,
    color: '#aaa',
  },
  menuButton: {
    padding: 4,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
});
