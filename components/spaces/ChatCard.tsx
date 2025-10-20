/**
 * ChatCard - Individual chat card with long-press menu
 * Shows chat title, snippet, and pinned status
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActionSheetIOS,
  Platform,
  type ViewStyle,
} from 'react-native';
import type { SpaceChat } from '../../lib/types';
import { lightTokens } from '../../design/tokens';
import { formatDistanceToNow } from 'date-fns';

interface ChatCardProps {
  chat: SpaceChat;
  onPress: () => void;
  onPin?: (chatId: string) => Promise<void>;
  onUnpin?: (chatId: string) => Promise<void>;
  onRename?: (chatId: string, newTitle: string) => Promise<void>;
  onArchive?: (chatId: string) => Promise<void>;
}

export function ChatCard({ chat, onPress, onPin, onUnpin, onRename, onArchive }: ChatCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const showActionMenu = () => {
    const options = [chat.pinned ? 'Unpin' : 'Pin', 'Rename', 'Archive', 'Cancel'];

    const destructiveButtonIndex = 2; // Archive
    const cancelButtonIndex = 3;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
        },
        async (buttonIndex) => {
          await handleMenuAction(buttonIndex);
        },
      );
    } else {
      // Android fallback - show Alert
      Alert.alert(chat.title, 'Choose an action', [
        { text: chat.pinned ? 'Unpin' : 'Pin', onPress: () => handleMenuAction(0) },
        { text: 'Rename', onPress: () => handleMenuAction(1) },
        { text: 'Archive', onPress: () => handleMenuAction(2), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleMenuAction = async (index: number) => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);

      switch (index) {
        case 0: // Pin/Unpin
          if (chat.pinned) {
            await onUnpin?.(chat.id);
          } else {
            await onPin?.(chat.id);
          }
          break;

        case 1: // Rename
          if (Platform.OS === 'ios') {
            Alert.prompt(
              'Rename Chat',
              'Enter a new title for this chat',
              async (newTitle) => {
                if (newTitle && newTitle.trim()) {
                  await onRename?.(chat.id, newTitle.trim());
                }
              },
              'plain-text',
              chat.title,
            );
          } else {
            // Android doesn't support Alert.prompt
            Alert.alert('Rename', 'Rename functionality requires native input (iOS only for now)');
          }
          break;

        case 2: // Archive
          Alert.alert('Archive Chat', 'Are you sure you want to archive this chat?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Archive',
              style: 'destructive',
              onPress: async () => await onArchive?.(chat.id),
            },
          ]);
          break;
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const timeAgo = formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true });

  return (
    <TouchableOpacity
      style={[styles.card, chat.pinned && styles.pinnedCard]}
      onPress={onPress}
      onLongPress={showActionMenu}
      disabled={isProcessing}
      accessibilityLabel={`Chat: ${chat.title}`}
      accessibilityHint="Tap to open, long press for options"
      accessibilityRole="button"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {chat.pinned && <Text style={styles.pinIcon}>📌</Text>}
          <Text style={styles.title} numberOfLines={1}>
            {chat.title}
          </Text>
        </View>
        <Text style={styles.timestamp}>{timeAgo}</Text>
      </View>

      {chat.last_message_snippet && (
        <Text style={styles.snippet} numberOfLines={2}>
          {chat.last_message_snippet}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightTokens.colors.surface,
    borderRadius: lightTokens.radius[3],
    padding: lightTokens.spacing[4],
    marginBottom: lightTokens.spacing[4],
    minHeight: 44, // Phase 8 polish: Ensure minimum tap target
    ...lightTokens.elevation.md,
  } as ViewStyle,
  pinnedCard: {
    backgroundColor: lightTokens.colors.accentMint,
    borderWidth: 2,
    borderColor: lightTokens.colors.primary,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: lightTokens.spacing[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: lightTokens.spacing[2],
  },
  pinIcon: {
    fontSize: 14,
    marginRight: lightTokens.spacing[1],
  },
  title: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.text,
    flex: 1,
  },
  timestamp: {
    fontSize: lightTokens.typography.size.xs,
    color: lightTokens.colors.subtle,
  },
  snippet: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    lineHeight: 20,
  },
});
