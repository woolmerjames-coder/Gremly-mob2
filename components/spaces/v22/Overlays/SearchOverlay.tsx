import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import { X as CloseIcon } from 'lucide-react-native';
import { useRepo } from '../../../../providers/RepoProvider';
import type { AppRecord, SpaceChat } from '../../../../lib/types';

export type SearchOverlayProps = {
  visible: boolean;
  onClose: () => void;
  spaceId?: string; // if provided, enables backend search scoped to space
};

const FILTERS = ['Chats', 'Notes', 'To-Dos', 'Habits'] as const;
export type FilterKey = (typeof FILTERS)[number];

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ visible, onClose, spaceId }) => {
  const opacity = React.useMemo(() => new Animated.Value(0), []);
  const translateY = React.useMemo(() => new Animated.Value(-16), []);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState<Record<FilterKey, boolean>>({
    Chats: true,
    Notes: true,
    'To-Dos': true,
    Habits: true,
  });
  const repo = useRepo();
  const [items, setItems] = React.useState<AppRecord[]>([]);
  const [chats, setChats] = React.useState<SpaceChat[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      translateY.setValue(-16);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10,
        onPanResponderMove: (_e, g) => {
          if (g.dy < 0) {
            // slight upward resistance
            translateY.setValue(Math.max(-24, g.dy));
          }
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -40) {
            onClose();
          } else {
            Animated.timing(translateY, {
              toValue: 0,
              duration: 120,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [onClose, translateY],
  );

  const toggle = (key: FilterKey) => {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Debounced search
  React.useEffect(() => {
    let cancelled = false;
    if (!visible) return; // don't fetch when hidden
    const q = query.trim();
    if (!spaceId || q.length < 2) {
      // Clear on short query or when spaceId not provided
      setItems([]);
      setChats([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await repo.searchInSpace(spaceId, q);
        if (!cancelled) {
          setItems(res.items ?? []);
          setChats(res.chats ?? []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, spaceId, repo, visible]);

  const filteredItems = React.useMemo(() => {
    return items.filter((it) => {
      if (it.type === 'todo') return active['To-Dos'];
      if (it.type === 'note') return active['Notes'];
      if (it.type === 'habit') return active['Habits'];
      return false;
    });
  }, [items, active]);

  const filteredChats = React.useMemo(() => {
    return active['Chats'] ? chats : [];
  }, [chats, active]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.cardWrap, { opacity, transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Search</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close search"
              >
                <CloseIcon color={COLORS.Deep} size={20} />
              </TouchableOpacity>
            </View>

            <View style={{ height: 12 }} />

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats, notes, or actions in this Space."
              placeholderTextColor="#5A6D60"
              style={styles.input}
              autoFocus
              accessibilityLabel="Search space"
              testID="search-overlay-input"
            />

            <View style={{ height: 10 }} />

            <View style={styles.chipsRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => toggle(f)}
                  accessibilityRole="button"
                  style={[styles.chip, active[f] ? styles.chipOn : styles.chipOff]}
                >
                  <Text
                    style={[styles.chipText, active[f] ? styles.chipTextOn : styles.chipTextOff]}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 12 }} />

            {/* Results */}
            <View style={styles.results} testID="search-overlay-results">
              {!spaceId && (
                <Text style={styles.resultHint}>
                  Search is scoped to a space. No space detected.
                </Text>
              )}
              {!!spaceId && query.trim().length < 2 && (
                <Text style={styles.resultHint}>Type at least 2 characters to search.</Text>
              )}
              {loading && <Text style={styles.resultHint}>Searching…</Text>}
              {!!error && <Text style={[styles.resultHint, { color: '#8B3A3A' }]}>{error}</Text>}

              {!!spaceId && query.trim().length >= 2 && !loading && !error && (
                <>
                  {filteredChats.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Chats</Text>
                      {filteredChats.map((c) => (
                        <View key={`chat-${c.id}`} style={styles.resultRow}>
                          <Text style={styles.resultTitle} numberOfLines={1}>
                            {c.title}
                          </Text>
                          {!!c.last_message_snippet && (
                            <Text style={styles.resultSub} numberOfLines={1}>
                              {c.last_message_snippet}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {filteredItems.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Items</Text>
                      {filteredItems.map((it) => (
                        <View key={`${it.type}-${it.id}`} style={styles.resultRow}>
                          <Text style={styles.badge}>
                            {it.type === 'todo' ? 'To-Do' : it.type === 'note' ? 'Note' : 'Habit'}
                          </Text>
                          <Text style={styles.resultTitle} numberOfLines={1}>
                            {'name' in it && it.name
                              ? it.name
                              : 'title' in it
                                ? (it as any).title
                                : ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {filteredChats.length === 0 && filteredItems.length === 0 && (
                    <Text style={styles.resultHint}>No matches found.</Text>
                  )}
                </>
              )}
            </View>

            <View style={{ height: 12 }} />
            <Text style={styles.hint}>Swipe up to close</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.20)', // Deep glass underlay
  },
  cardWrap: {
    marginTop: 64, // appear just below header band
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: 'rgba(249,246,241,0.90)', // Linen @ 90%
    padding: SPACE.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.Deep,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1F2E27',
    borderWidth: 1,
    borderColor: 'rgba(21,51,38,0.18)',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  chipOn: {
    backgroundColor: '#E6EDE7',
    borderColor: '#ADC6B0',
  },
  chipOff: {
    backgroundColor: 'transparent',
    borderColor: '#C6D6C9',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextOn: {
    color: '#1F2E27',
  },
  chipTextOff: {
    color: '#5A6D60',
  },
  hint: {
    textAlign: 'center',
    color: '#5A6D60',
    fontSize: 12,
  },
  results: {
    marginTop: 8,
    gap: 6,
  },
  section: {
    marginBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.Deep,
    marginBottom: 4,
  },
  resultRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(21,51,38,0.08)',
  },
  resultTitle: {
    color: '#1F2E27',
    fontSize: 14,
    fontWeight: '600',
  },
  resultSub: {
    color: '#5A6D60',
    fontSize: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    color: '#2E5540',
    backgroundColor: '#E6EDE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginBottom: 2,
  },
  resultHint: {
    color: '#5A6D60',
    fontSize: 12,
  },
});

export default SearchOverlay;
