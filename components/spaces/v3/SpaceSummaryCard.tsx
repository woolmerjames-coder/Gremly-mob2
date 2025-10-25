import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

export type SpaceSummaryCardProps = {
  headline: string; // already condensed to one sentence by caller
  secondary?: string; // optional subtle line
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
        <Text style={styles.headline} numberOfLines={1}>
          {clampOneLine(headline, 110)}
        </Text>
      );

    const [pre, post] = headline.split(String(numberInHeadline));
    const num = numberInHeadline === null ? '' : (display ?? numberInHeadline);
    return (
      <Text style={styles.headline} numberOfLines={1}>
        {pre}
        <Text style={styles.number}>{num}</Text>
        {post}
      </Text>
    );
  };

  return (
    <TouchableOpacity activeOpacity={onExpand ? 0.7 : 1} onPress={onExpand} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.brain} accessibilityLabel="brain">
          🧠
        </Text>
        <View style={{ flex: 1 }}>{renderHeadline()}</View>
      </View>
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
    backgroundColor: C.linenCream,
    borderRadius: R[2],
    paddingHorizontal: S[4],
    paddingVertical: S[3],
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: S[2] },
  headline: {
    color: C.charcoalInk ?? C.text,
    fontSize: t.typography.size.lg,
  },
  number: {
    color: '#E0C47A',
    fontWeight: '700',
  },
  secondary: {
    marginTop: 4,
    color: C.subtle,
    fontSize: t.typography.size.sm,
  },
  brain: { fontSize: 20, opacity: 0.7, marginRight: S[1] },
});

export default SpaceSummaryCard;

function clampOneLine(text: string, maxChars = 110): string {
  const t1 = text.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
  if (t1.length <= maxChars) return t1;
  return t1.slice(0, maxChars - 1) + '…';
}
