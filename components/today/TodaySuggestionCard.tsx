/**
 * TodaySuggestionCard - Phase 9: Energy & Momentum
 * Suggestion card for Today v2 screen
 * Step 5: Updated to work with new Suggestion type with payloads
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { pulse } from '../../lib/today/motion';
import { isReducedMotion } from '../../lib/a11y/reducedMotion';
import type { Suggestion } from '../../lib/today/useTodayData';

export interface TodaySuggestionCardProps {
  suggestion: Suggestion;
  onAccept: (suggestion: Suggestion) => void;
  reducedMotion?: boolean;
}

export default function TodaySuggestionCard({
  suggestion,
  onAccept,
  reducedMotion,
}: TodaySuggestionCardProps) {
  const t = useTokens();
  const scale = useMemo(() => new Animated.Value(1), []);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Determine if reduced motion should be active
  const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();

  // Pulse animation on mount (unless reduced motion)
  useEffect(() => {
    if (!rm) {
      animationRef.current = pulse(scale, rm);
    }
    // Cleanup: stop animation
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
      scale.stopAnimation();
    };
  }, [rm, scale]);

  return (
    <Animated.View style={!rm ? { transform: [{ scale }] } : undefined}>
      <Card
        variant="outlined"
        padding="md"
        style={{ borderColor: t.colors.accentPeri }}
        testID={`suggestion-card-${suggestion.id}`}
      >
        <View style={styles.container}>
          {/* Left: Sparkle icon and text */}
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={styles.sparkle}>✨</Text>
              <Text variant="body" style={styles.title}>
                {suggestion.title}
              </Text>
            </View>
            {suggestion.reason && (
              <Text variant="subtle" style={styles.reason}>
                {suggestion.reason}
              </Text>
            )}
          </View>

          {/* Right: CTA button */}
          <Button
            label={suggestion.cta || 'Try it'}
            variant="outline"
            onPress={() => onAccept(suggestion)}
            testID={`suggestion-accept-${suggestion.id}`}
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
