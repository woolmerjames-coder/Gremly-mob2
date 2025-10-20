/**
 * TodaySuggestionCard - Phase 9: Energy & Momentum
 * Suggestion card for Today v2 screen
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { pulse } from '../../lib/today/motion';

export interface TodaySuggestionCardProps {
  id: string;
  title: string;
  reason?: string;
  ctaLabel?: string;
  onAccept: (id: string) => void;
  reducedMotion?: boolean;
}

export default function TodaySuggestionCard({
  id,
  title,
  reason = 'Might be today?',
  ctaLabel = 'Try it',
  onAccept,
  reducedMotion = false,
}: TodaySuggestionCardProps) {
  const t = useTokens();
  const scale = useMemo(() => new Animated.Value(1), []);

  // Pulse animation on mount (unless reduced motion)
  useEffect(() => {
    if (!reducedMotion) {
      pulse(scale, reducedMotion);
    }
    // Cleanup: stop animation
    return () => {
      scale.stopAnimation();
    };
  }, [reducedMotion, scale]);

  return (
    <Animated.View style={!reducedMotion ? { transform: [{ scale }] } : undefined}>
      <Card
        variant="outlined"
        padding="md"
        style={{ borderColor: t.colors.accentPeri }}
        testID={`suggestion-card-${id}`}
      >
        <View style={styles.container}>
          {/* Left: Sparkle icon and text */}
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={styles.sparkle}>✨</Text>
              <Text variant="body" style={styles.title}>
                {title}
              </Text>
            </View>
            {reason && (
              <Text variant="subtle" style={styles.reason}>
                {reason}
              </Text>
            )}
          </View>

          {/* Right: CTA button */}
          <Button
            label={ctaLabel}
            variant="outline"
            onPress={() => onAccept(id)}
            testID={`suggestion-accept-${id}`}
          />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sparkle: {
    fontSize: 20,
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  reason: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
