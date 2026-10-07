/**
 * What sits under today's thread while the weekly review is under way: the
 * loading card while Gremly makes his read, and the Carry on button after
 * anything typed. The review never moves on by itself after a message; when
 * Gremly's reply asked them something first, the button waits for the answer.
 * Also the button to their week that goes under a reply of Gremly's.
 */
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarRange } from 'lucide-react-native';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const LAPTOP_GREMLY = WEEK_MASCOTS.laptop;

export function WeekFooter({
  loading,
  canCarryOn,
  disabled,
  onCarryOn,
}: {
  loading: boolean;
  canCarryOn: boolean;
  disabled?: boolean;
  onCarryOn: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.wrap}>
        <View style={[weekStyles.card, styles.loading]} testID="week-loading">
          <Image source={LAPTOP_GREMLY} style={styles.mascot} />
          <View style={weekStyles.grow}>
            <Text style={styles.title}>{WEEK_COPY.loadingTitle}</Text>
            <Text style={weekStyles.hint}>{WEEK_COPY.loadingHint}</Text>
          </View>
          <ActivityIndicator color={WEEK.green} />
        </View>
      </View>
    );
  }
  if (!canCarryOn) return null;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[weekStyles.main, styles.carryOn, disabled && weekStyles.off]}
        onPress={onCarryOn}
        disabled={disabled}
        accessibilityRole="button"
        testID="week-carry-on"
      >
        <Text style={weekStyles.mainText}>{WEEK_COPY.carryOn}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** The button to their week, under a reply of Gremly's. */
export function WeekOfferButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.offer, disabled && weekStyles.off]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="week-offer"
    >
      <CalendarRange size={17} color={WEEK.linen} strokeWidth={2.4} />
      <Text style={weekStyles.mainText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mascot: { width: 56, height: 56 },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, color: WEEK.ink },
  carryOn: { borderRadius: 14 },
  offer: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: WEEK.green,
  },
});
