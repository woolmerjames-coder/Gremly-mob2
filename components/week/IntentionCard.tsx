/**
 * One line to hold onto this week, in their own words first. The field is
 * theirs to write in. Suggest one puts a line of Gremly's in it, the one that
 * goes with what they chose as mattering most, which they can keep, change
 * or ask for another of. Skip leaves the week without one.
 */
import React from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const MEDITATING_GREMLY = WEEK_MASCOTS.meditating;

export interface IntentionCardProps {
  /** The words in the field: their own, or a line of Gremly's they asked for. Once kept, the intention. */
  own: string;
  /** Gremly has a line to give, and the field is empty or still holds one of his */
  canSuggest: boolean;
  editable: boolean;
  editing: boolean;
  locked: boolean;
  disabled?: boolean;
  onWrite: (text: string) => void;
  onSuggest: () => void;
  onDone: () => void;
  onSkip: () => void;
  onChange: () => void;
  onJustPlan: () => void;
}

export function IntentionCard(p: IntentionCardProps) {
  const has = !!p.own.trim();
  return (
    <View style={styles.wrap} testID="week-intention">
      <Image
        source={MEDITATING_GREMLY}
        style={styles.mascot}
        accessibilityLabel="Gremly meditating"
      />
      {p.editable ? (
        <>
          <TextInput
            style={styles.input}
            value={p.own}
            onChangeText={p.onWrite}
            placeholder={WEEK_COPY.ownWords}
            placeholderTextColor={WEEK.faint}
            accessibilityLabel="Your intention for the week"
            editable={!p.disabled}
            maxLength={200}
            multiline
            testID="week-intention-own"
          />
          {has ? (
            <TouchableOpacity
              style={[weekStyles.main, p.disabled && weekStyles.off]}
              onPress={p.onDone}
              disabled={p.disabled}
              accessibilityRole="button"
              testID="week-intention-done"
            >
              <Text style={weekStyles.mainText}>
                {p.editing ? WEEK_COPY.save : WEEK_COPY.keepThis}
              </Text>
            </TouchableOpacity>
          ) : null}
          <View style={weekStyles.pair}>
            {p.canSuggest ? (
              <TouchableOpacity
                style={[weekStyles.second, weekStyles.grow, p.disabled && weekStyles.off]}
                onPress={p.onSuggest}
                disabled={p.disabled}
                accessibilityRole="button"
                testID="week-intention-suggest"
              >
                <Text style={weekStyles.secondText}>{WEEK_COPY.suggestOne}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[weekStyles.second, weekStyles.grow, p.disabled && weekStyles.off]}
              onPress={p.onSkip}
              disabled={p.disabled}
              accessibilityRole="button"
              testID="week-intention-skip"
            >
              <Text style={weekStyles.secondText}>{WEEK_COPY.skipIntention}</Text>
            </TouchableOpacity>
          </View>
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
      ) : has ? (
        // the one they kept, as they kept it
        <View style={styles.kept} testID="week-intention-kept">
          <Text style={styles.quote}>{'“'}</Text>
          <Text style={styles.keptText}>{p.own.trim()}</Text>
        </View>
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
  kept: {
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: WEEK.ink,
  },
  quote: { fontFamily: 'Georgia', fontSize: 30, lineHeight: 30, height: 20, color: WEEK.amberInk },
  keptText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    lineHeight: 22,
    color: WEEK.linen,
  },
  // room for a line of ten words or so, growing with what they write
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WEEK.line,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 21,
    color: WEEK.ink,
    backgroundColor: WEEK.white,
    textAlignVertical: 'top',
  },
});
