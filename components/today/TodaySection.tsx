/**
 * TodaySection - Phase 9: Energy & Momentum
 * Collapsible section for Today v2 screen
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { collapseConfig, expandConfig } from '../../lib/today/motion';
import { isReducedMotion } from '../../lib/a11y/reducedMotion';

// Helper to convert title to kebab-case for testID
function toKebabCase(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-');
}

export interface TodaySectionProps {
  title: string;
  children?: React.ReactNode;
  initiallyExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  reducedMotion?: boolean;
}

export default function TodaySection({
  title,
  children,
  initiallyExpanded = true,
  onToggle,
  reducedMotion,
}: TodaySectionProps) {
  const t = useTokens();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const animatedHeight = useMemo(
    () => new Animated.Value(initiallyExpanded ? 1 : 0),
    [initiallyExpanded],
  );

  // Determine if reduced motion should be active
  const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();

  // Handle toggle
  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onToggle?.(newExpanded);

    // Animate height
    if (!rm) {
      Animated.timing(animatedHeight, {
        toValue: newExpanded ? 1 : 0,
        ...(newExpanded ? expandConfig(rm) : collapseConfig(rm)),
      }).start();
    } else {
      animatedHeight.setValue(newExpanded ? 1 : 0);
    }
  };

  // Sync animation on expanded prop change
  useEffect(() => {
    if (!rm) {
      Animated.timing(animatedHeight, {
        toValue: expanded ? 1 : 0,
        ...(expanded ? expandConfig(rm) : collapseConfig(rm)),
      }).start();
    } else {
      animatedHeight.setValue(expanded ? 1 : 0);
    }
  }, [expanded, rm, animatedHeight]);

  const kebabTitle = toKebabCase(title);

  const animatedStyle = {
    opacity: animatedHeight,
    maxHeight: animatedHeight.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 10000], // Large number for content height
    }),
  };

  return (
    <View style={styles.container} testID={`today-section-${kebabTitle}`}>
      {/* Section header with toggle */}
      <TouchableOpacity
        onPress={handleToggle}
        style={[styles.header, { borderBottomColor: t.colors.border }]}
        activeOpacity={0.7}
        testID={`today-section-toggle-${kebabTitle}`}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title} section`}
      >
        <Text variant="title" style={styles.title}>
          {title}
        </Text>
        <Text style={[styles.chevron, { color: t.colors.subtle }]}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {/* Collapsible content */}
      {reducedMotion ? (
        // No animation for reduced motion - simple conditional render
        expanded && <View style={styles.content}>{children}</View>
      ) : (
        // Animated collapse/expand
        <Animated.View style={[styles.content, animatedStyle]}>{children}</Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
  },
  chevron: {
    fontSize: 14,
    marginLeft: 8,
  },
  content: {
    gap: 12,
    overflow: 'hidden',
  },
});
