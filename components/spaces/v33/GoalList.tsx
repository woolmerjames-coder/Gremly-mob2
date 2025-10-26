import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GoalCard, { type GoalCardProps } from './GoalCard';
import { COLORS, RADII, SPACE } from './_tokens';

export type GoalItem = {
  id: string;
  title: string;
  subtitle?: string;
  state: 'idle' | 'active' | 'complete';
  icon?: React.ReactNode;
  lastActivityAt?: string | null;
  pinned?: boolean;
  createdAt?: string | null;
};

type Props = {
  goals: GoalItem[];
  topN?: number;
  onOpen: (id: string) => void;
  onMenu: (id: string) => void;
  initiallyExpanded?: boolean;
  totalCountLabel?: (count: number) => string;
  persistKey?: string; // goalList:expanded:${spaceId}
};

export default function GoalList({
  goals,
  topN = 3,
  onOpen,
  onMenu,
  initiallyExpanded = false,
  totalCountLabel,
  persistKey,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(initiallyExpanded);
  const [anim] = useState(() => ({ opacity: new Animated.Value(0), y: new Animated.Value(8) }));

  // Load persisted expanded state (optional)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!persistKey) return;
      try {
        const v = await AsyncStorage.getItem(persistKey);
        if (!cancelled && (v === '1' || v === '0')) setExpanded(v === '1');
      } catch {
        /* ignore */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [persistKey]);

  // Persist on change
  useEffect(() => {
    if (!persistKey) return;
    AsyncStorage.setItem(persistKey, expanded ? '1' : '0').catch(() => undefined);
  }, [expanded, persistKey]);

  // Sort comparator
  const sorted = useMemo(() => {
    const copy = [...goals];
    copy.sort((a, b) => {
      const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : -Infinity;
      const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : -Infinity;
      if (at !== bt) return bt - at; // DESC
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap; // pinned first
      const ac = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
      const bc = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
      return bc - ac; // newest first
    });
    return copy;
  }, [goals]);

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const remainingCount = Math.max(0, sorted.length - topN);

  const toggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  // Animate expanded list container
  useEffect(() => {
    if (expanded) {
      anim.opacity.setValue(0);
      anim.y.setValue(8);
      Animated.parallel([
        Animated.timing(anim.opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(anim.y, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // no collapse animation for simplicity (instant hide)
  }, [expanded, anim.opacity, anim.y]);

  const renderTopCard = (g: GoalItem) => (
    <GoalCard
      key={g.id}
      id={g.id}
      title={g.title}
      state={g.state as GoalCardProps['state']}
      subtitle={g.subtitle}
      onOpen={() => onOpen(g.id)}
      onMenu={() => onMenu(g.id)}
    />
  );

  const renderFlatCard = (g: GoalItem) => (
    <Pressable
      key={g.id}
      onPress={() => onOpen(g.id)}
      accessibilityRole="button"
      style={styles.flatCard}
    >
      <View style={styles.flatIcon} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.flatTitle} numberOfLines={1}>
          {g.title}
        </Text>
        {!!g.subtitle && (
          <Text style={styles.flatSubtitle} numberOfLines={1}>
            {g.subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={{ marginVertical: 24 }}>
      <View style={{ gap: 10 }}>{top.map(renderTopCard)}</View>

      {remainingCount > 0 && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            testID="GoalsToggle"
            style={({ pressed }: any) => [styles.toggle, pressed && styles.togglePressed]}
          >
            <Text style={styles.toggleText}>
              {expanded
                ? '[ – Show Less ]'
                : `[ + ${totalCountLabel ? totalCountLabel(remainingCount) : `See All Goals (${remainingCount})`} ]`}
            </Text>
          </Pressable>
        </View>
      )}

      {expanded && rest.length > 0 && (
        <Animated.View
          testID="GoalsExpandedList"
          style={{
            marginTop: 12,
            gap: 10,
            opacity: anim.opacity,
            transform: [{ translateY: anim.y }],
          }}
        >
          {rest.map(renderFlatCard)}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingVertical: 6, paddingHorizontal: 10 },
  togglePressed: { textDecorationLine: 'underline' },
  toggleText: { color: COLORS.Moss, fontWeight: '700' },
  flatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.Linen,
    borderRadius: RADII.card,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.1)', // Sage @10%
  },
  flatIcon: { width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(46,85,64,0.25)' },
  flatTitle: { fontWeight: '700', color: COLORS.Deep, fontSize: 15 },
  flatSubtitle: { color: 'rgba(26,51,40,0.7)', marginTop: 2, fontSize: 12 },
});
