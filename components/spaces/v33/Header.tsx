import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { Search as SearchIcon } from '../../icons';

export type HeaderProps = {
  title: string;
  lastVisited?: string;
  moodLine?: { tone: 'calm' | 'proud' | 'low'; text: string };
  onSearch: () => void;
};

export default function Header({ title, lastVisited, moodLine, onSearch }: HeaderProps) {
  const moodColor = (() => {
    if (!moodLine) return 'rgba(34,34,34,0.6)';
    switch (moodLine.tone) {
      case 'proud':
        return COLORS.Pear;
      case 'low':
        return 'rgba(191,216,192,0.6)'; // Sage @60%
      case 'calm':
      default:
        return 'rgba(191,216,192,0.8)'; // Sage @80%
    }
  })();

  return (
    <View style={styles.wrap}>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!lastVisited && (
          <Text style={styles.subline} numberOfLines={1}>
            {lastVisited}
          </Text>
        )}
        {!!moodLine && (
          <Text style={[styles.mood, { color: moodColor }]} numberOfLines={1}>
            {moodLine.text}
          </Text>
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
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.Sage,
    paddingHorizontal: SPACE.md,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomLeftRadius: RADII.card,
    borderBottomRightRadius: RADII.card,
  },
  center: { flex: 1, alignItems: 'center' },
  title: { color: COLORS.Moss, fontSize: 20, fontWeight: '700' },
  subline: { marginTop: 2, fontSize: 12, color: 'rgba(34,34,34,0.6)' },
  mood: { marginTop: 2, fontSize: 11 },
  actions: {
    position: 'absolute',
    right: SPACE.md,
    top: 16,
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
