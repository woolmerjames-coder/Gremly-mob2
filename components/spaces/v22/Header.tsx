import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADII, SPACE } from './_tokens';
import { Search, Settings } from '../../icons';

export type HeaderTone = 'calm' | 'neutral' | 'proud' | 'low';

export type HeaderProps = {
  title: string;
  lastVisited?: string;
  contextLine?: { text: string; tone: HeaderTone };
  onSearch?: () => void;
  onSettings?: () => void;
  onBack?: () => void;
};

export const Header: React.FC<HeaderProps> = ({
  title,
  lastVisited,
  contextLine,
  onSearch,
  onSettings,
  onBack,
}) => {
  const contextColor = getContextColor(contextLine?.tone);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {/* Back chevron as text glyph to avoid adding another icon */}
          <Text style={styles.chevron}>‹</Text>
        </TouchableOpacity>

        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!lastVisited && (
            <Text style={styles.subline} numberOfLines={1}>
              {lastVisited}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onSearch}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Search color={COLORS.Linen} size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Settings color={COLORS.Linen} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {!!contextLine?.text && (
        <Text style={[styles.context, { color: contextColor }]} numberOfLines={2}>
          {contextLine.text}
        </Text>
      )}
      {/* Soft fade under header to mimic gradient */}
      <View style={styles.fadeUnder} />
    </View>
  );
};

function getContextColor(tone: HeaderTone | undefined): string {
  switch (tone) {
    case 'proud':
      return COLORS.Pear;
    case 'neutral':
      return COLORS.Sage;
    case 'calm':
      return '#F9F6F1CC'; // Linen @ 80%
    case 'low':
      return '#8AA08D'; // desaturated sage
    default:
      return COLORS.Sage;
  }
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.Moss,
    paddingHorizontal: SPACE.md,
    paddingVertical: 18,
    borderBottomLeftRadius: RADII.header,
    borderBottomRightRadius: RADII.header,
    // subtle drop shadow
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: {
    color: COLORS.Linen,
    fontSize: 22,
    lineHeight: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACE.sm,
  },
  title: {
    color: COLORS.Linen,
    fontSize: 21,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  subline: {
    marginTop: 2,
    color: COLORS.Sage,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  context: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  fadeUnder: {
    height: 12,
    marginTop: 8,
    // approximate soft gradient with a translucent Moss tint
    backgroundColor: 'rgba(46,85,64,0.08)',
    borderBottomLeftRadius: RADII.header,
    borderBottomRightRadius: RADII.header,
  },
});

export default Header;
