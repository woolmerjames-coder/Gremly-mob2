import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII, SPACE } from './_tokens';
import { Search as SearchIcon, ChevronLeft } from '../../icons';
import Mascot from './Mascot';

export const HEADER_HEIGHT = 140; // Approximate height for layout calculations

export type HeaderProps = {
  title: string;
  lastVisited?: string;
  wittyLine?: string;
  mood?: 'calm' | 'proud' | 'low' | 'neutral';
  onSearch?: () => void; // Optional now since search moved to IconRow
  showBack?: boolean;
};

export default function Header({
  title,
  lastVisited,
  wittyLine,
  mood = 'neutral',
  onSearch,
  showBack,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [backPressed, setBackPressed] = useState(false);

  // Auto-detect if we can go back
  const canGoBack =
    showBack ?? (typeof navigation.canGoBack === 'function' ? navigation.canGoBack() : false);

  const wittyColor = (() => {
    switch (mood) {
      case 'proud':
        return COLORS.Pear;
      case 'low':
        return `${COLORS.Sage}CC`; // Sage @80%
      case 'calm':
        return `${COLORS.Moss}CC`; // Moss @80%
      case 'neutral':
      default:
        return COLORS.TextLight;
    }
  })();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
      {/* Button overlay row */}
      <View style={styles.buttonRow}>
        <View style={styles.leftButtonSlot}>
          {canGoBack && (
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              testID="HeaderBackButton"
              onPress={async () => {
                try {
                  await Haptics.selectionAsync();
                } catch (e) {
                  // Haptics may not be available
                }
                if (canGoBack) navigation.goBack();
              }}
              onPressIn={() => setBackPressed(true)}
              onPressOut={() => setBackPressed(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.backButton, backPressed && styles.backButtonPressed]}
            >
              <ChevronLeft color={COLORS.Moss} size={22} strokeWidth={2} />
            </Pressable>
          )}
        </View>
        <View style={styles.rightButtonSlot}>
          {onSearch && (
            <TouchableOpacity
              accessibilityLabel="Search"
              accessibilityRole="button"
              onPress={onSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.searchButton}
            >
              <SearchIcon color={COLORS.Deep} size={24} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Two-column content: Text | Mascot */}
      <View style={styles.contentRow}>
        {/* Text column */}
        <View style={styles.textColumn}>
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
              <Text style={[styles.witty, { color: wittyColor }]} numberOfLines={2}>
                {wittyLine}
              </Text>
              <View style={styles.accentBar} />
            </>
          )}
        </View>

        {/* Mascot column */}
        <View style={styles.mascotSlot}>
          <Mascot size={96} testID="HeaderMascot" />
        </View>
      </View>

      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.Linen,
    paddingHorizontal: SPACE.lg,
    paddingBottom: 12,
    position: 'relative',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    height: 44,
  },
  leftButtonSlot: {
    width: 44,
    alignItems: 'flex-start',
  },
  rightButtonSlot: {
    width: 44,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  backButtonPressed: {
    backgroundColor: 'rgba(191,216,192,0.15)', // Sage @15%
  },
  searchButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  textColumn: {
    flex: 1,
    paddingRight: SPACE.md,
  },
  mascotSlot: {
    width: 108,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  title: {
    color: COLORS.Moss,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 34,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  subline: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.TextLight,
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
  },
  witty: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0.2,
    fontFamily: 'Inter-Regular',
  },
  accentBar: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.HeaderAccent,
    marginTop: 8,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(34,34,34,0.08)',
  },
});
