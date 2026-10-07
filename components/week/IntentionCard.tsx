/**
 * One line to hold onto this week: three drafts from the weekly read to tap,
 * or their own words. The one they keep becomes the week's intention.
 */
import React from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const MEDITATING_GREMLY = WEEK_MASCOTS.meditating;

export interface IntentionCardProps {
  drafts: string[];
  /** The draft picked, when their own words are empty */
  picked: number | null;
  own: string;
  editable: boolean;
  editing: boolean;
  locked: boolean;
  disabled?: boolean;
  onPick: (index: number) => void;
  onWrite: (text: string) => void;
  onDone: () => void;
  onChange: () => void;
  onJustPlan: () => void;
}

export function IntentionCard(p: IntentionCardProps) {
  const has = !!p.own.trim() || p.picked != null;
  return (
    <View style={styles.wrap} testID="week-intention">
      <Image
        source={MEDITATING_GREMLY}
        style={styles.mascot}
        accessibilityLabel="Gremly meditating"
      />
      {p.drafts.map((t, i) => {
        const on = !p.own.trim() && p.picked === i;
        return (
          <TouchableOpacity
            key={i}
            style={[styles.draft, on && styles.draftOn]}
            onPress={() => p.onPick(i)}
            disabled={!p.editable || p.disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            activeOpacity={0.85}
            testID={`week-intention-${i}`}
          >
            <Text style={styles.quote}>{'“'}</Text>
            <Text style={[styles.draftText, on && styles.draftTextOn]}>{t}</Text>
          </TouchableOpacity>
        );
      })}
      {p.editable ? (
        <>
          <TextInput
            style={styles.input}
            value={p.own}
            onChangeText={p.onWrite}
            placeholder={WEEK_COPY.ownWords}
            placeholderTextColor={WEEK.faint}
            accessibilityLabel="Your own intention"
            editable={!p.disabled}
            maxLength={200}
            testID="week-intention-own"
          />
          <TouchableOpacity
            style={[
              weekStyles.main,
              !has && !p.editing && weekStyles.mainOff,
              p.disabled && weekStyles.off,
            ]}
            onPress={p.onDone}
            disabled={p.disabled}
            accessibilityRole="button"
            testID="week-intention-done"
          >
            <Text style={[weekStyles.mainText, !has && !p.editing && weekStyles.mainTextOff]}>
              {p.editing ? WEEK_COPY.save : has ? WEEK_COPY.keepThis : WEEK_COPY.skipStep}
            </Text>
          </TouchableOpacity>
          {!p.editing ? (
            <TouchableOpacity
              style={weekStyles.link}
              onPress={p.onJustPlan}
              disabled={p.disabled}
              accessibilityRole="button"
            >
              <Text style={weekStyles.linkText}>{WEEK_COPY.justPlan}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
      {p.locked ? (
        <TouchableOpacity
          style={weekStyles.link}
          onPress={p.onChange}
          disabled={p.disabled}
          accessibilityRole="button"
          testID="week-intention-change"
        >
          <Text style={weekStyles.linkText}>{WEEK_COPY.change}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  mascot: { alignSelf: 'center', width: 84, height: 84 },
  draft: {
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: WEEK.soft,
    backgroundColor: WEEK.white,
  },
  draftOn: { borderColor: WEEK.ink, backgroundColor: WEEK.ink },
  quote: { fontFamily: 'Georgia', fontSize: 30, lineHeight: 30, height: 20, color: WEEK.amberInk },
  draftText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    lineHeight: 22,
    color: WEEK.ink,
  },
  draftTextOn: { color: WEEK.linen },
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WEEK.line,
    paddingHorizontal: 14,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: WEEK.ink,
    backgroundColor: WEEK.white,
  },
});
