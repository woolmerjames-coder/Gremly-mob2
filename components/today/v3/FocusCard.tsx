import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Pressable, Animated, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { GRADIENTS } from '../../../design/gradients';
import { useFocusCard } from '../../../lib/today/hooks/useFocusCard';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { selectItemById } from '../../../lib/store/selectors';

type Props = {
  onChange?: () => void;
  onClear?: () => void;
  autoSuggestIfEmpty?: boolean;
};

export default function FocusCard({ onChange, onClear, autoSuggestIfEmpty = true }: Props) {
  const { focus, autosuggest, clear, loading } = useFocusCard();

  // Get focused item's title from Zustand store (sync lookup)
  const title = useGremlyStore((s) => {
    if (!focus?.entry_id || !focus.entry_type) return null;
    const rec = selectItemById(s, focus.entry_id);
    if (!rec) return null;
    // Get name/title from the record - different types have different field names
    const recAny = rec as unknown as Record<string, unknown>;
    return typeof recAny.name === 'string'
      ? recAny.name
      : typeof recAny.title === 'string'
        ? recAny.title
        : null;
  });

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

      <Text style={styles.title}>If you could finish just one thing today…</Text>

      <Animated.View style={[styles.underline, { opacity: underlineOpacity }]} />

      {focus?.entry_id ? (
        <Text style={styles.focus} numberOfLines={2}>
          {title || 'Untitled'}
        </Text>
      ) : (
        <Text style={styles.focusMuted}>No focus yet — choose one.</Text>
      )}

      <View style={styles.metaRow}>
        {subtitle ? (
          <Text style={styles.microcopy} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          <View style={styles.metaSpacer} />
        )}

        <View style={styles.actionsWrapper} testID="today-hero-actions">
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
              accessibilityHint="Remove the current focus"
            >
              {({ pressed }) => (
                <Text style={[styles.link, pressed && styles.linkPressed]}>Clear</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  prompt: {
    ...BRAND.typography.italic,
    fontSize: 14,
    color: BRAND.colors.sageMist,
    marginTop: 0,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    marginBottom: 4,
  },
  focus: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  focusMuted: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    opacity: 0.8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  actionsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaSpacer: {
    flex: 1,
  },
  microcopy: {
    flex: 1,
    fontSize: 12,
    color: '#4C6A59',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginTop: 0,
    marginBottom: 6,
    height: 2,
    width: 64,
    backgroundColor: BRAND.colors.goldenPear,
    borderRadius: 2,
  },
});
