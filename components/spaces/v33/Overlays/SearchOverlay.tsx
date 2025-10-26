import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  Text,
  ScrollView,
  Pressable,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import {
  MessageSquare,
  StickyNote,
  CheckCircle2,
  ChevronRight,
  Search as SearchIcon,
  X,
} from '../../../icons';
import { useSpaceSearch, type SearchItem } from '../../../../hooks/useSpaceSearch';

type Props = {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  onOpenChat: (chatId: string) => void;
  onOpenNote: (noteId: string) => void;
  onOpenHabit: (habitId: string) => void;
};

export default function SearchOverlay({
  visible,
  onClose,
  spaceId,
  onOpenChat,
  onOpenNote,
  onOpenHabit,
}: Props) {
  const insets = useSafeAreaInsets();
  const y = useMemo(() => new Animated.Value(-12), []);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'chats' | 'notes' | 'habits'>('chats');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const { search } = useSpaceSearch(spaceId);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      // Autofocus
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      Animated.parallel([
        Animated.timing(y, {
          toValue: -12,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(() => {
        // Reset state after animation completes
        setQuery('');
        setResults([]);
      });
    }
  }, [visible, y, opacity]);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      // Clear results immediately without debounce
      if (results.length > 0) setResults([]);
      if (loading) setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      const items = await search(trimmedQuery, filter);
      setResults(items);
      setLoading(false);
    }, 250);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, search]);

  const handleResultPress = useCallback(
    (item: SearchItem) => {
      Keyboard.dismiss();
      onClose();
      if (item.type === 'chat') onOpenChat(item.id);
      else if (item.type === 'note') onOpenNote(item.id);
      else if (item.type === 'habit') onOpenHabit(item.id);
    },
    [onClose, onOpenChat, onOpenNote, onOpenHabit],
  );

  if (!visible) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity,
            transform: [{ translateY: y }],
          },
        ]}
      >
        {/* Glass bar with input and chips */}
        <BlurView intensity={8} style={styles.blurWrap}>
          <View style={styles.barContainer}>
            <View style={styles.searchRow}>
              <SearchIcon size={20} color={COLORS.Moss} style={{ opacity: 0.6 }} />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Search this Space…"
                placeholderTextColor="rgba(26,51,40,0.4)"
                value={query}
                onChangeText={setQuery}
                accessibilityLabel="Search this Space"
                testID="SpaceSearchInput"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => setQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={18} color={COLORS.Moss} style={{ opacity: 0.5 }} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}
            >
              <Chip label="Chats" active={filter === 'chats'} onPress={() => setFilter('chats')} />
              <Chip label="Notes" active={filter === 'notes'} onPress={() => setFilter('notes')} />
              <Chip
                label="Habits"
                active={filter === 'habits'}
                onPress={() => setFilter('habits')}
              />
            </ScrollView>
          </View>
        </BlurView>

        {/* Results panel */}
        {query.trim().length > 0 && (
          <View style={styles.resultsPanel}>
            {loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Searching…</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No results yet — try a different word.</Text>
              </View>
            ) : (
              <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                {results.map((item) => (
                  <ResultRow key={item.id} item={item} onPress={() => handleResultPress(item)} />
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </Animated.View>

      {/* Backdrop for dismiss */}
      {visible && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      )}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ResultRow({ item, onPress }: { item: SearchItem; onPress: () => void }) {
  const Icon =
    item.type === 'chat' ? MessageSquare : item.type === 'note' ? StickyNote : CheckCircle2;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.type}: ${item.title}`}
      style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
    >
      <View style={styles.resultIcon}>
        <Icon size={18} color={COLORS.Moss} />
      </View>
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {(item.snippet || item.dateLabel) && (
          <Text style={styles.resultSnippet} numberOfLines={1}>
            {item.snippet || item.dateLabel}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={COLORS.Moss} style={{ opacity: 0.3 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  overlay: {
    zIndex: 101,
  },
  blurWrap: {
    overflow: 'hidden',
    borderRadius: 12,
    marginHorizontal: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.1)',
  },
  barContainer: {
    backgroundColor: 'rgba(249,246,241,0.92)', // Linen 92%
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.Deep,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  cancelButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelText: {
    color: COLORS.Moss,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  chipsScroll: {
    marginTop: 10,
  },
  chipsContent: {
    gap: 8,
  },
  chip: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(191,216,192,0.2)',
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: 'rgba(46,85,64,0.4)',
    backgroundColor: 'rgba(191,216,192,0.1)',
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    color: 'rgba(26,51,40,0.7)',
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  chipTextActive: {
    color: COLORS.Moss,
    fontWeight: '700',
  },
  resultsPanel: {
    backgroundColor: COLORS.Linen,
    marginHorizontal: SPACE.md,
    marginTop: 8,
    borderRadius: 12,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resultsList: {
    flex: 1,
  },
  emptyState: {
    paddingVertical: 40,
    paddingHorizontal: SPACE.md,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(26,51,40,0.6)',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(46,85,64,0.1)',
  },
  resultRowPressed: {
    backgroundColor: 'rgba(191,216,192,0.1)',
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(46,85,64,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    color: COLORS.Deep,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  resultSnippet: {
    color: 'rgba(26,51,40,0.6)',
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
});
