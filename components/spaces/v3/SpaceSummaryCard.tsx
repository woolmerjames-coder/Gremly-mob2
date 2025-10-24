import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type SpaceSummaryCardProps = {
  headline: string;
  secondary?: string;
  onExpand?: () => void;
};

/**
 * SpaceSummaryCard
 * Compact summary block with count-up animation for the first number in the headline.
 * NOTE: Using accentMint for numeric highlight (closest token to "Golden Pear").
 */
export const SpaceSummaryCard: React.FC<SpaceSummaryCardProps> = ({
  headline,
  secondary,
  onExpand,
}) => {
  const numberInHeadline = useMemo(() => {
    const match = headline.match(/\d+(?:\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }, [headline]);

  const anim = useMemo(() => new Animated.Value(0), []);
  const target = numberInHeadline ?? 0;

  useEffect(() => {
    if (numberInHeadline !== null) {
      anim.stopAnimation();
      anim.removeAllListeners?.();
      anim.setValue(0);
      Animated.timing(anim, { toValue: target, duration: 600, useNativeDriver: false }).start();
    }
  }, [anim, numberInHeadline, target]);

  const [display, setDisplay] = useState<number | null>(numberInHeadline);
  useEffect(() => {
    if (numberInHeadline === null) {
      // No numeric animation for this headline; detach any listeners.
      anim.removeAllListeners?.();
      return;
    }
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => {
      anim.removeListener?.(id);
    };
  }, [anim, numberInHeadline]);

  const renderHeadline = () => {
    if (numberInHeadline === null)
      return (
        <Text style={styles.headline} numberOfLines={2}>
          {headline}
        </Text>
      );

    const [pre, post] = headline.split(String(numberInHeadline));
    const num = numberInHeadline === null ? '' : (display ?? numberInHeadline);
    return (
      <Text style={styles.headline} numberOfLines={2}>
        {pre}
        <Text style={styles.number}>{num}</Text>
        {post}
      </Text>
    );
  };

  return (
    <TouchableOpacity activeOpacity={onExpand ? 0.7 : 1} onPress={onExpand} style={styles.card}>
      {renderHeadline()}
      {secondary ? (
        <Text style={styles.secondary} numberOfLines={1}>
          {secondary}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

const C = t.colors;
const S = t.spacing;
const R = t.radius;

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: R[2],
    paddingHorizontal: S[4],
    paddingVertical: S[3],
    ...t.elevation.sm,
  },
  headline: {
    color: C.text,
    fontSize: t.typography.size.lg,
  },
  number: {
    color: C.accentMint,
    fontWeight: '700',
  },
  secondary: {
    marginTop: 4,
    color: C.subtle,
    fontSize: t.typography.size.sm,
  },
});

export default SpaceSummaryCard;
