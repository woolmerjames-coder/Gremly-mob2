/**
 * CollapsibleCard - Reusable card with collapse/expand functionality
 * Supports animations and persisted state
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  type ViewStyle,
} from 'react-native';
import { lightTokens } from '../../design/tokens';
import { useReducedMotion } from '../../design/animations';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

interface CollapsibleCardProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  initialCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
}

export function CollapsibleCard({
  title,
  icon,
  children,
  initialCollapsed = false,
  onToggle,
}: CollapsibleCardProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const isReducedMotion = useReducedMotion(); // Phase 8 polish: Respect accessibility preferences

  // Create Animated.Value directly - useMemo ensures it's only created once
  const rotateAnim = useMemo(
    () => new Animated.Value(initialCollapsed ? 0 : 1),
    [initialCollapsed],
  );

  // Create interpolated value - useMemo ensures it's only created once
  const chevronRotation = useMemo(
    () =>
      rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
      }),
    [rotateAnim],
  );

  const toggleCollapse = () => {
    // Phase 8 polish: Use native layout animation for smooth transitions (unless reduced motion)
    if (!isReducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onToggle?.(newCollapsed);

    // Phase 8 polish: Animate chevron rotation (unless reduced motion)
    if (!isReducedMotion) {
      Animated.timing(rotateAnim, {
        toValue: newCollapsed ? 0 : 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      // Skip animation, set immediately
      rotateAnim.setValue(newCollapsed ? 0 : 1);
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleCollapse}
        accessibilityLabel={`${title}. ${collapsed ? 'Collapsed' : 'Expanded'}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to toggle"
      >
        <View style={styles.titleRow}>
          {icon && <Text style={styles.icon}>{icon}</Text>}
          <Text style={styles.title}>{title}</Text>
        </View>
        <Animated.View
          style={{
            transform: [{ rotate: chevronRotation }],
          }}
        >
          <Text style={styles.chevron}>▼</Text>
        </Animated.View>
      </TouchableOpacity>

      {!collapsed && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightTokens.colors.surface,
    borderRadius: lightTokens.radius[3],
    marginBottom: lightTokens.spacing[4],
    overflow: 'hidden',
    ...lightTokens.elevation.sm,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: lightTokens.spacing[4],
    minHeight: 56, // Ensure tap target is ≥ 44pt
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 20,
    marginRight: lightTokens.spacing[2],
  },
  title: {
    fontSize: lightTokens.typography.size.lg,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
  chevron: {
    fontSize: 14,
    color: lightTokens.colors.subtle,
  },
  content: {
    paddingHorizontal: lightTokens.spacing[4],
    paddingBottom: lightTokens.spacing[4],
  },
});
