import React, { useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { SpaceChat } from '../../../lib/types';
import { COLORS, RADII, SPACE } from './_tokens';
import { generateChatTitle } from '../../../lib/ai/chatTitle';
import { format } from 'date-fns';
import { MoreVertical } from '../../icons';
import Menu from './Menu';

export type ThreadCardProps = {
  chat: SpaceChat;
  onPress: (chatId: string) => void;
  onRename?: (chatId: string) => void;
  onDelete?: (chatId: string) => void;
};

export default function ThreadCard({ chat, onPress, onRename, onDelete }: ThreadCardProps) {
  const lift = useMemo(() => new Animated.Value(0), []);
  const [showMenu, setShowMenu] = useState(false);
  const [anchorLayout, setAnchorLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const menuButtonRef = useRef<View>(null);

  const title = useMemo(() => {
    // Try AI generator based on last snippet and any existing title
    const msgs = [
      chat.title ? { role: 'user', content: chat.title } : null,
      chat.last_message_snippet ? { role: 'assistant', content: chat.last_message_snippet } : null,
    ].filter(Boolean) as any[];
    const ai = generateChatTitle(msgs);
    return ai || chat.title || 'New Chat';
  }, [chat]);

  const snippet = chat.last_message_snippet || '';
  const dateLabel = (() => {
    const iso = (chat.updated_at as unknown as string) || (chat as any).created_at;
    if (!iso) return '';
    try {
      return format(new Date(iso), 'MMM d');
    } catch {
      return '';
    }
  })();

  return (
    <Pressable
      onPress={() => onPress(chat.id)}
      onPressIn={() =>
        Animated.timing(lift, { toValue: -2, duration: 80, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.timing(lift, { toValue: 0, duration: 120, useNativeDriver: true }).start()
      }
      accessibilityRole="button"
    >
      <Animated.View style={[styles.card, { transform: [{ translateY: lift }] }]}>
        <View style={styles.iconWrap}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M4 6h16v12H4z" fill="none" stroke={COLORS.Moss} strokeWidth={2} />
            <Path d="M7 9h10" stroke={COLORS.Moss} strokeWidth={1.8} />
            <Path d="M7 13h7" stroke={COLORS.Moss} strokeWidth={1.8} />
          </Svg>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!snippet && (
            <Text style={styles.snippet} numberOfLines={1}>
              {snippet}
            </Text>
          )}
        </View>
        {!!dateLabel && (
          <Text style={styles.date} numberOfLines={1}>
            {dateLabel}
          </Text>
        )}
        {(onRename || onDelete) && (
          <View style={{ position: 'relative' }}>
            <View
              ref={menuButtonRef}
              collapsable={false}
              onLayout={(e) => {
                menuButtonRef.current?.measureInWindow((x, y, width, height) => {
                  setAnchorLayout({ x, y, width, height });
                });
              }}
            >
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  menuButtonRef.current?.measureInWindow((x, y, width, height) => {
                    setAnchorLayout({ x, y, width, height });
                    setShowMenu(true);
                  });
                }}
                style={styles.menuButton}
                accessibilityRole="button"
                accessibilityLabel="Chat options"
              >
                <MoreVertical size={20} color={COLORS.Moss} opacity={0.6} />
              </TouchableOpacity>
            </View>
            {showMenu && anchorLayout && (
              <Menu
                items={[
                  ...(onRename ? [{ key: 'rename', label: 'Rename Chat' }] : []),
                  ...(onDelete ? [{ key: 'delete', label: 'Delete Chat', danger: true }] : []),
                ]}
                onSelect={(key) => {
                  if (key === 'rename' && onRename) onRename(chat.id);
                  if (key === 'delete' && onDelete) onDelete(chat.id);
                }}
                onClose={() => setShowMenu(false)}
                anchorLayout={anchorLayout}
              />
            )}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,34,34,0.08)',
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  title: {
    color: COLORS.Deep,
    fontWeight: '600',
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  snippet: { color: 'rgba(26,51,40,0.7)', fontSize: 12, marginTop: 2, lineHeight: 17 },
  date: { color: 'rgba(26,51,40,0.6)', fontSize: 12, marginLeft: 8, lineHeight: 17 },
  menuButton: {
    padding: 4,
    marginLeft: 4,
  },
});
