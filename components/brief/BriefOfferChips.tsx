/**
 * The buttons under Gremly's offer: Plan my afternoon, Sweep first, Not today,
 * a question's answers... Right aligned like the person's own replies, the
 * first one filled when it is the suggested choice.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { OfferButton } from '../../lib/brief/types';
import { BRIEF } from './briefStyles';

type Props = {
  buttons: OfferButton[];
  onPress: (button: OfferButton) => void;
  disabled?: boolean;
  testID?: string;
};

export function BriefOfferChips({ buttons, onPress, disabled, testID }: Props) {
  if (!buttons.length) return null;
  return (
    <View style={styles.row} testID={testID ?? 'brief-offer-chips'}>
      {buttons.map((b) => (
        <TouchableOpacity
          key={b.id}
          style={[styles.chip, b.primary && styles.primary, disabled && styles.disabled]}
          onPress={() => onPress(b)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={b.label}
          activeOpacity={0.8}
          testID={`brief-chip-${b.id}`}
        >
          <Text style={[styles.label, b.primary && styles.primaryLabel]}>{b.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  primary: {
    backgroundColor: BRIEF.moss,
    borderColor: BRIEF.moss,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 14,
    lineHeight: 17,
    color: BRIEF.moss,
  },
  primaryLabel: {
    color: BRIEF.linen,
  },
});
