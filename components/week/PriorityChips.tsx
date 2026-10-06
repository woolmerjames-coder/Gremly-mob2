/**
 * What matters most this week: up to five options from the weekly read as
 * chips, Gremly's own picks starred, and they keep up to three. The button
 * under them says how many they picked, or lets them skip.
 */
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { WEEK_COPY, prioritiesButton } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const CLIPBOARD_GREMLY = WEEK_MASCOTS.clipboard;

export interface PriorityChipsProps {
  options: { text: string; star: boolean }[];
  /** Indexes of the ones picked */
  picked: number[];
  /** Chips can be tapped and the button shows */
  editable: boolean;
  /** Opened again with Change: the button says Save */
  editing: boolean;
  /** Settled: Change shows */
  locked: boolean;
  disabled?: boolean;
  onToggle: (index: number) => void;
  onDone: () => void;
  onChange: () => void;
  onJustPlan: () => void;
}

export function PriorityChips({
  options,
  picked,
  editable,
  editing,
  locked,
  disabled,
  onToggle,
  onDone,
  onChange,
  onJustPlan,
}: PriorityChipsProps) {
  const n = picked.length;
  return (
    <View style={[weekStyles.card, styles.card]} testID="week-priorities">
      <Image
        source={CLIPBOARD_GREMLY}
        style={styles.mascot}
        accessibilityLabel="Gremly with a clipboard"
      />
      <View style={styles.chips}>
        {options.map((o, i) => {
          const on = picked.includes(i);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.chip, o.star && styles.chipStar, on && styles.chipOn]}
              onPress={() => onToggle(i)}
              disabled={!editable || disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.star ? `${o.text}, Gremly's pick` : o.text}
              activeOpacity={0.8}
              testID={`week-priority-${i}`}
            >
              {o.star ? (
                <Star
                  size={13}
                  color={on ? WEEK.amber : WEEK.amberDeep}
                  fill={on ? WEEK.amber : WEEK.amberDeep}
                />
              ) : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {editable ? (
        <>
          <TouchableOpacity
            style={[
              weekStyles.main,
              !n && !editing && weekStyles.mainOff,
              disabled && weekStyles.off,
            ]}
            onPress={onDone}
            disabled={disabled}
            accessibilityRole="button"
            testID="week-priorities-done"
          >
            <Text style={[weekStyles.mainText, !n && !editing && weekStyles.mainTextOff]}>
              {prioritiesButton(n, editing)}
            </Text>
          </TouchableOpacity>
          {!editing ? (
            <TouchableOpacity
              style={weekStyles.link}
              onPress={onJustPlan}
              disabled={disabled}
              accessibilityRole="button"
            >
              <Text style={weekStyles.linkText}>{WEEK_COPY.justPlan}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
      {locked ? (
        <TouchableOpacity
          style={weekStyles.link}
          onPress={onChange}
          disabled={disabled}
          accessibilityRole="button"
          testID="week-priorities-change"
        >
          <Text style={weekStyles.linkText}>{WEEK_COPY.change}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 22 },
  mascot: { position: 'absolute', right: 6, top: -30, width: 66, height: 66 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingRight: 50 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: WEEK.chipLine,
    backgroundColor: WEEK.white,
  },
  chipStar: { borderColor: WEEK.amberDeep },
  chipOn: { borderColor: WEEK.green, backgroundColor: WEEK.green },
  chipText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: WEEK.ink, flexShrink: 1 },
  chipTextOn: { color: WEEK.linen },
});
