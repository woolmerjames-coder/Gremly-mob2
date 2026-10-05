/**
 * A sheet that rises over the journal page, inside it: the page underneath
 * keeps what is written, and a tap outside the sheet closes it.
 *
 * It stays clear of the home bar, and of the keyboard when it is told how far
 * that pushes it up.
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRIEF } from '../brief/briefStyles';

export type JournalSheetProps = {
  onClose: () => void;
  /** What a tap outside the sheet does, for a screen reader */
  closeLabel: string;
  /** How far the keyboard pushes the sheet up, for one with something to type in */
  lift?: Animated.Value;
  testID: string;
  closeTestID: string;
  children: React.ReactNode;
};

export function JournalSheet({
  onClose,
  closeLabel,
  lift,
  testID,
  closeTestID,
  children,
}: JournalSheetProps) {
  const insets = useSafeAreaInsets();
  const bottom = lift
    ? lift.interpolate({
        inputRange: [0, insets.bottom + 1, 2000],
        outputRange: [insets.bottom + 16, insets.bottom + 17, 2016],
      })
    : insets.bottom + 16;

  return (
    <View style={styles.fill} testID={testID}>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        testID={closeTestID}
      />
      <Animated.View style={[styles.sheet, { paddingBottom: bottom }]}>
        <View style={styles.grab} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 5 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 51, 40, 0.34)' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: BRIEF.linen,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(46, 85, 64, 0.22)',
    marginBottom: 14,
  },
});
