import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACE } from './_tokens';
import { Search as SearchIcon } from '../../icons';

export type HeaderProps = {
  title: string;
  lastVisited?: string;
  wittyLine?: string;
  mood?: 'calm' | 'proud' | 'low' | 'neutral';
  onSearch: () => void;
};

export default function Header({
  title,
  lastVisited,
  wittyLine,
  mood = 'neutral',
  onSearch,
}: HeaderProps) {
  const insets = useSafeAreaInsets();

  // Debug: log what we receive
  if (__DEV__) {
    console.log('[HeaderV33] title:', title, 'lastVisited:', lastVisited);
  }

  const wittyColor = (() => {
    switch (mood) {
      case 'proud':
        return COLORS.Pear;
      case 'low':
        return `${COLORS.Sage}CC`; // Sage @80%
      case 'calm':
        return `${COLORS.Moss}99`; // Moss @60%
      case 'neutral':
      default:
        return 'rgba(34,34,34,0.7)'; // Text @70%
    }
  })();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
      <View style={styles.inner}>
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!lastVisited && (
            <Text style={styles.subline} numberOfLines={1}>
              {lastVisited}
            </Text>
          )}
          {!!wittyLine && (
            <>
              <View style={styles.wittyDot} />
              <Text style={[styles.witty, { color: wittyColor }]} numberOfLines={1}>
                {wittyLine}
              </Text>
            </>
          )}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityLabel="Search"
            accessibilityRole="button"
            onPress={onSearch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SearchIcon color={COLORS.Deep} size={24} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.Sage,
    paddingHorizontal: SPACE.md,
    // paddingTop now dynamic via insets.top + 12
    paddingBottom: 8,
    borderBottomLeftRadius: RADII.card,
    borderBottomRightRadius: RADII.card,
    // subtle shadow
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  center: { flex: 1, alignItems: 'center' },
  title: {
    color: COLORS.Moss,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 32,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  subline: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(34,34,34,0.6)',
    lineHeight: 17,
    fontFamily: 'Inter-Regular',
  },
  wittyDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.Moss,
    marginTop: 6,
    marginBottom: 2,
    opacity: 0.4,
  },
  witty: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
    fontFamily: 'Inter-Regular',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(46,85,64,0.1)', // Moss @10%
    borderBottomLeftRadius: RADII.card,
    borderBottomRightRadius: RADII.card,
  },
});
