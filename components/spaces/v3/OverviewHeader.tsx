import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { lightTokens as t } from '../../../design/tokens';

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

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.999, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      <View style={styles.band} />
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
        <Animated.View style={[styles.titleWrap, { transform: [{ scale }] }]}>
          <Text style={styles.title} numberOfLines={1}>
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
const C = t.colors;

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.linenCream,
    paddingBottom: S[3],
  },
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: C.sageMist,
    opacity: 0.9,
    borderBottomLeftRadius: R[2],
    borderBottomRightRadius: R[2],
  },
  row: {
    paddingTop: S[3],
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
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.elevation.sm,
  },
  iconBtnPlaceholder: { width: 36, height: 36 },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: S[1],
    paddingHorizontal: S[3],
    backgroundColor: C.linenCream,
    borderRadius: R[2], // 10-12px equivalent
    ...t.elevation.sm, // low shadow
  },
  title: {
    color: C.mossGreen,
    fontSize: t.typography.size.xl,
    fontFamily: t.typography.fontFamily.bold,
  },
  iconTxt: { color: C.mossGreen, fontSize: 18 },
});

export default OverviewHeader;
