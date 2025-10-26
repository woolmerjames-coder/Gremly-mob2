import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, useColorScheme } from 'react-native';
import { lightTokens as t, darkTokens } from '../../../design/tokens';

export type OverviewHeaderProps = {
  spaceName: string;
  onBack?: () => void;
  onSearch?: () => void;
};

/**
 * OverviewHeader
 * Brand-aligned header band with Moss Green title and subtle Sage Mist -> Linen Cream feel.
 * Uses a tiny pulse on mount via Animated API.
 */
export const OverviewHeader: React.FC<OverviewHeaderProps> = ({ spaceName, onBack, onSearch }) => {
  const scale = useMemo(() => new Animated.Value(0.98), []);
  const scheme = useColorScheme();
  const T = scheme === 'dark' ? darkTokens : t;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.999, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [scale]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: scheme === 'dark' ? t.colors.deepForest : t.colors.sageMist },
      ]}
    >
      <View
        style={[
          styles.band,
          { backgroundColor: scheme === 'dark' ? t.colors.deepForest : t.colors.sageMist },
        ]}
      />
      <View style={styles.row}>
        <View style={styles.left}>
          {onBack ? (
            <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.iconBtn}>
              <Text style={styles.iconTxt}>‹</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtnPlaceholder} />
          )}
        </View>
        <Animated.View style={{ flex: 1, alignItems: 'center', transform: [{ scale }] }}>
          <Text
            style={[
              styles.title,
              { color: scheme === 'dark' ? t.colors.linenCream : t.colors.charcoalInk },
            ]}
            numberOfLines={1}
          >
            {spaceName}
          </Text>
        </Animated.View>
        <View style={styles.right}>
          {onSearch ? (
            <TouchableOpacity accessibilityRole="button" onPress={onSearch} style={styles.iconBtn}>
              <Text style={styles.iconTxt}>🔍</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtnPlaceholder} />
          )}
        </View>
      </View>
    </View>
  );
};

const R = t.radius;
const S = t.spacing;

const styles = StyleSheet.create({
  container: {
    paddingBottom: S[2],
  },
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 68,
    opacity: 0.98,
  },
  row: {
    paddingTop: S[2],
    paddingHorizontal: S[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: { width: 48, alignItems: 'flex-start' },
  right: { width: 48, alignItems: 'flex-end' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.elevation.sm,
  },
  iconBtnPlaceholder: { width: 36, height: 36 },
  title: {
    fontSize: t.typography.size.xl,
    fontWeight: '700',
  },
  iconTxt: { color: t.colors.mossGreen, fontSize: 18 },
});

export default OverviewHeader;
