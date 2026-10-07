/**
 * The weekly review's opening card: how the week looks to Gremly. One
 * headline (the big challenge), the figures behind it, what they are coming
 * off, and what is coming up on a line. Every word on it is from the weekly
 * read; this only lays it out. Their answer sits under it: about right, or
 * not quite.
 */
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

const LAPTOP_GREMLY = WEEK_MASCOTS.laptop;

export interface ChallengeCardProps {
  headline: string;
  why?: string;
  evidence: { figure: string; label: string }[];
  comingOff?: string;
  /** Each moment with when it is, already in words ("Wed", "20 Oct") */
  comingUp: { when: string; what: string }[];
  /** What they said Gremly had missed */
  added?: string | null;
  /** The buttons show: the card is waiting for their answer */
  asking: boolean;
  disabled?: boolean;
  onAgree: () => void;
  onDisagree: () => void;
  onJustPlan: () => void;
}

export function ChallengeCard({
  headline,
  why,
  evidence,
  comingOff,
  comingUp,
  added,
  asking,
  disabled,
  onAgree,
  onDisagree,
  onJustPlan,
}: ChallengeCardProps) {
  return (
    <View testID="week-challenge">
      <View style={[weekStyles.dark, styles.card]}>
        <Image
          source={LAPTOP_GREMLY}
          style={styles.mascot}
          accessibilityLabel="Gremly with a laptop"
        />
        <View style={styles.head}>
          <Text style={weekStyles.darkKicker}>{WEEK_COPY.challengeKicker}</Text>
          <Text style={styles.headline}>{headline}</Text>
          {why ? <Text style={styles.why}>{why}</Text> : null}
        </View>
        {evidence.length ? (
          <View style={styles.tiles}>
            {evidence.map((t, i) => (
              <View key={i} style={styles.tile}>
                <Text style={[styles.figure, t.figure.length > 6 && styles.figureLong]}>
                  {t.figure}
                </Text>
                <Text style={styles.tileLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {added ? (
          <View style={styles.added} testID="week-challenge-added">
            <Text style={styles.addedKicker}>{WEEK_COPY.youAdded}</Text>
            <Text style={styles.addedText}>{added}</Text>
          </View>
        ) : null}
        {comingOff ? (
          <View style={styles.block}>
            <Text style={weekStyles.darkKicker}>{WEEK_COPY.comingOff}</Text>
            <Text style={styles.why}>{comingOff}</Text>
          </View>
        ) : null}
        {comingUp.length ? (
          <View style={styles.block}>
            <Text style={weekStyles.darkKicker}>{WEEK_COPY.comingUp}</Text>
            <View style={styles.timeline}>
              <View style={styles.rail} />
              {comingUp.map((c, i) => (
                <View key={i} style={styles.moment}>
                  <View style={styles.dot} />
                  <Text style={styles.when}>{c.when}</Text>
                  <Text style={styles.what} numberOfLines={3}>
                    {c.what}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      {asking ? (
        <View style={styles.answer}>
          <View style={weekStyles.pair}>
            <TouchableOpacity
              style={[weekStyles.main, styles.button, weekStyles.grow, disabled && weekStyles.off]}
              onPress={onAgree}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-challenge-agree"
            >
              <Text style={weekStyles.mainText}>{WEEK_COPY.agree}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[weekStyles.second, weekStyles.grow, disabled && weekStyles.off]}
              onPress={onDisagree}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-challenge-disagree"
            >
              <Text style={weekStyles.secondText}>{WEEK_COPY.disagree}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={weekStyles.link}
            onPress={onJustPlan}
            disabled={disabled}
            accessibilityRole="button"
            testID="week-just-plan"
          >
            <Text style={weekStyles.linkText}>{WEEK_COPY.justPlan}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // room above for Gremly, who sits on the card's top edge
  card: { marginTop: 26 },
  mascot: { position: 'absolute', right: 8, top: -34, width: 78, height: 78 },
  head: { gap: 6 },
  headline: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    lineHeight: 26,
    color: WEEK.linen,
    paddingRight: 54,
  },
  why: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: WEEK.darkText },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: WEEK.darkTile,
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  figure: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 24, lineHeight: 28, color: WEEK.amber },
  figureLong: { fontSize: 18 },
  tileLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, color: WEEK.darkText },
  added: {
    backgroundColor: WEEK.amber,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  addedKicker: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.7, color: WEEK.ink },
  addedText: { fontFamily: 'Inter-SemiBold', fontSize: 14, lineHeight: 19, color: WEEK.ink },
  block: { gap: 8 },
  timeline: { flexDirection: 'row', justifyContent: 'space-between' },
  rail: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 6,
    height: 2,
    backgroundColor: 'rgba(169,201,178,0.35)',
  },
  moment: { width: 62, alignItems: 'center', gap: 4 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: WEEK.amber,
    borderWidth: 2,
    borderColor: WEEK.ink,
  },
  when: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: WEEK.amber, textAlign: 'center' },
  what: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 14,
    color: '#E8F0EA',
    textAlign: 'center',
  },
  answer: { marginTop: 12, gap: 8 },
  button: { borderRadius: 14 },
});
