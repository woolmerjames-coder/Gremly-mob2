import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Pressable, Animated, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { GRADIENTS } from '../../../design/gradients';
import { useFocusCard } from '../../../lib/today/hooks/useFocusCard';
import { useRepo } from '../../../providers/RepoProvider';

type Props = {
  onChange?: () => void;
  onClear?: () => void;
  autoSuggestIfEmpty?: boolean;
};

export default function FocusCard({ onChange, onClear, autoSuggestIfEmpty = true }: Props) {
  const { focus, autosuggest, clear, loading } = useFocusCard();
  const repo = useRepo();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!focus?.entry_id || !focus.entry_type) {
        setTitle(null);
        return;
      }
      try {
        type RepoWithGetById = {
          getById?: (id: string) => Promise<{
            name?: string | null;
            title?: string | null;
          } | null>;
        };
        const repoWithGetById = repo as RepoWithGetById;
        const rec = await repoWithGetById.getById?.(focus.entry_id);
        if (!cancelled) {
          const name =
            typeof rec?.name === 'string'
              ? rec.name
              : typeof rec?.title === 'string'
                ? rec.title
                : null;
          setTitle(name);
        }
      } catch {
        if (!cancelled) setTitle(null);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [focus?.entry_id, focus?.entry_type, repo]);

  useEffect(() => {
    if (autoSuggestIfEmpty && !loading && !focus) {
      void autosuggest();
    }
  }, [autoSuggestIfEmpty, loading, focus, autosuggest]);

  const [shimmer] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.timing(shimmer, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [shimmer]);
  const underlineOpacity = useMemo(
    () => shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
    [shimmer],
  );

  const subtitle = useMemo(() => {
    if (!focus) return '';
    switch (focus.source) {
      case 'auto':
        return 'Suggested by Gremly';
      case 'carry_forward':
        return 'Carried forward from last night';
      case 'user':
        return 'You chose this.';
      default:
        return '';
    }
  }, [focus]);

  const handleClear = () => {
    void clear();
    onClear?.();
  };

  return (
    <LinearGradient
      colors={GRADIENTS.focusHeroV2}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.panel}
      testID="focus-panel"
      accessibilityRole="summary"
      accessibilityLabel="Focus for today"
    >
      <Text style={styles.prompt} numberOfLines={1}>
        If you could finish just one thing today…
      </Text>

      <Text style={styles.title}>Focus for today</Text>

      {focus?.entry_id ? (
        <Text style={styles.focus} numberOfLines={2}>
          {title || 'Untitled'}
        </Text>
      ) : (
        <Text style={styles.focusMuted}>No focus yet — choose one.</Text>
      )}

      {!!subtitle && (
        <Text style={styles.microcopy} numberOfLines={1}>
          {subtitle}
        </Text>
      )}

      <Animated.View style={[styles.underline, { opacity: underlineOpacity }]} />

      <View style={styles.actions} testID="focus-actions">
        <Pressable
          onPress={onChange}
          accessibilityLabel="Change focus"
          accessibilityHint="Pick a different focus"
        >
          {({ pressed }) => (
            <Text style={[styles.link, pressed && styles.linkPressed]}>Change</Text>
          )}
        </Pressable>
        <Text style={styles.separator}>•</Text>
        <Pressable
          onPress={handleClear}
          accessibilityLabel="Clear focus"
          accessibilityHint="Removes today’s focus"
        >
          {({ pressed }) => <Text style={[styles.link, pressed && styles.linkPressed]}>Clear</Text>}
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  prompt: {
    ...BRAND.typography.italic,
    fontSize: 14,
    color: BRAND.colors.sageMist,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 6,
  },
  focus: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  focusMuted: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    opacity: 0.8,
  },
  microcopy: {
    marginTop: 4,
    fontSize: 12,
    color: '#4C6A59',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  link: {
    fontSize: 12,
    color: BRAND.colors.mossGreen,
    textDecorationLine: 'underline',
    textDecorationColor: BRAND.colors.mossGreen,
  },
  linkPressed: {
    opacity: 0.7,
  },
  separator: {
    color: BRAND.colors.inkMuted,
  },
  underline: {
    marginTop: 8,
    marginBottom: 6,
    height: 2,
    width: 64,
    backgroundColor: BRAND.colors.goldenPear,
    borderRadius: 2,
  },
});
