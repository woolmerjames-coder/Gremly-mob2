import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GoalRow from './GoalRow';
import GoalSection from './GoalSection';
import { COLORS } from './_tokens';

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

  const renderTopCard = (g: GoalItem) => {
    // Extract done/target from subtitle "X/Y this week"
    const match = g.subtitle?.match(/(\d+)\/(\d+)/);
    const done = match ? parseInt(match[1], 10) : 0;
    const target = match ? parseInt(match[2], 10) : 3;
    return (
      <GoalRow
        key={g.id}
        id={g.id}
        title={g.title}
        done={done}
        target={target}
        state={g.state}
        onPress={() => onOpen(g.id)}
      />
    );
  };

  const renderFlatCard = (g: GoalItem) => {
    const match = g.subtitle?.match(/(\d+)\/(\d+)/);
    const done = match ? parseInt(match[1], 10) : 0;
    const target = match ? parseInt(match[2], 10) : 3;
    return (
      <GoalRow
        key={g.id}
        id={g.id}
        title={g.title}
        done={done}
        target={target}
        state={g.state}
        onPress={() => onOpen(g.id)}
      />
    );
  };

  return (
    <GoalSection title="Goals & Focus">
      {top.map(renderTopCard)}

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
            marginTop: 4,
            opacity: anim.opacity,
            transform: [{ translateY: anim.y }],
          }}
        >
          {rest.map(renderFlatCard)}
        </Animated.View>
      )}
    </GoalSection>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingVertical: 6, paddingHorizontal: 10 },
  togglePressed: { textDecorationLine: 'underline' },
  toggleText: { color: COLORS.Moss, fontWeight: '700' },
});
