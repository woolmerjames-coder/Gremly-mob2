import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { SpaceChat } from '../../../lib/types';
import { COLORS, RADII, SPACE } from './_tokens';
import { generateChatTitle } from '../../../lib/ai/chatTitle';
import { format } from 'date-fns';

export type ThreadCardProps = {
  chat: SpaceChat;
  onPress: (chatId: string) => void;
};

export default function ThreadCard({ chat, onPress }: ThreadCardProps) {
  const lift = useMemo(() => new Animated.Value(0), []);

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
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.Linen,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.2)', // Sage @20%
    borderRadius: 10,
    padding: SPACE.md,
    // soft shadow
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46,85,64,0.08)',
  },
  title: { color: COLORS.Deep, fontWeight: '700', letterSpacing: 0.2, lineHeight: 20 },
  snippet: { color: 'rgba(26,51,40,0.7)', fontSize: 12, marginTop: 2, lineHeight: 17 },
  date: { color: 'rgba(26,51,40,0.6)', fontSize: 12, marginLeft: 8, lineHeight: 17 },
});
