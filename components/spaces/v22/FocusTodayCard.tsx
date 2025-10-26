import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated, useColorScheme } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';

export type FocusTodayMode = 'action' | 'reflect';

export type FocusTodayCardProps = {
  summary: string;
  mode: FocusTodayMode;
  onPrimary: () => void;
  onSecondary: () => void;
  dismissUntil?: Date;
};

const useLift = () => {
  const ty = React.useMemo(() => new Animated.Value(0), []);
  const handleIn = React.useCallback(() => {
    Animated.timing(ty, { toValue: -2, duration: 200, useNativeDriver: true }).start();
  }, [ty]);
  const handleOut = React.useCallback(() => {
    Animated.timing(ty, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [ty]);
  return { ty, handleIn, handleOut };
};

export const FocusTodayCard: React.FC<FocusTodayCardProps> = ({
  summary,
  mode,
  onPrimary,
  onSecondary,
}) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const primaryLift = useLift();
  const secondaryLift = useLift();

  return (
    <View
      style={[
        styles.wrap,
        isDark
          ? { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }
          : { backgroundColor: 'rgba(249, 246, 241, 0.95)', borderColor: COLORS.Sage },
      ]}
      accessibilityRole="summary"
    >
      <Text style={styles.title}>{mode === 'action' ? "Today's Focus" : 'Take a breath'}</Text>
      <Text style={[styles.body, isDark ? { color: '#EDEDE8' } : { color: COLORS.Text }]}>
        {summary}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onSecondary}
          onPressIn={secondaryLift.handleIn}
          onPressOut={secondaryLift.handleOut}
          accessibilityRole="button"
          accessibilityLabel={mode === 'action' ? 'Maybe later' : 'Maybe later'}
          style={({ pressed }) => [styles.secondary, pressed ? { opacity: 0.9 } : null]}
        >
          <Animated.Text
            style={[styles.secondaryText, { transform: [{ translateY: secondaryLift.ty }] }]}
          >
            Maybe later
          </Animated.Text>
        </Pressable>
        <Pressable
          onPress={onPrimary}
          onPressIn={primaryLift.handleIn}
          onPressOut={primaryLift.handleOut}
          accessibilityRole="button"
          accessibilityLabel={mode === 'action' ? 'Start now' : 'Set intention'}
          style={({ pressed }) => [styles.primary, pressed ? { opacity: 0.96 } : null]}
        >
          <Animated.Text
            style={[styles.primaryText, { transform: [{ translateY: primaryLift.ty }] }]}
          >
            {mode === 'action' ? 'Start now' : 'Set intention'}
          </Animated.Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: RADII.btn,
    padding: SPACE.md,
  },
  title: {
    color: COLORS.Deep,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  body: {
    color: COLORS.Text,
    fontSize: 14.5,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondary: {
    backgroundColor: COLORS.Sage,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  secondaryText: {
    color: COLORS.Moss,
    fontWeight: '600',
  },
  primary: {
    backgroundColor: '#436653', // Moss lightened
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  primaryText: {
    color: COLORS.Linen,
    fontWeight: '700',
  },
});

export default FocusTodayCard;
