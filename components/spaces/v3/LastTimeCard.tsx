import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type LastTimeCardProps = {
  text: string;
  updatedAt?: string;
};

/**
 * LastTimeCard
 * Linen Cream card with soft shadow. Small 🧠 glyph. Fade + slide-in on mount.
 */
export const LastTimeCard: React.FC<LastTimeCardProps> = ({ text, updatedAt }) => {
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(8), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.emoji} accessibilityLabel="brain">
        🧠
      </Text>
      <View style={styles.content}>
        <Text style={styles.text} numberOfLines={1}>
          {text}
        </Text>
        {updatedAt ? (
          <Text style={styles.updated} numberOfLines={1}>
            {updatedAt}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
};

const C = t.colors;
const S = t.spacing;
const R = t.radius;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.linenCream,
    borderRadius: R[2],
    paddingHorizontal: S[4],
    paddingVertical: S[3],
    ...t.elevation.sm,
  },
  emoji: { fontSize: 21, marginRight: S[3] },
  content: { flex: 1 },
  text: {
    color: C.text,
    fontSize: t.typography.size.md,
  },
  updated: {
    marginTop: 2,
    color: C.subtle,
    fontSize: t.typography.size.sm,
  },
});

export default LastTimeCard;
