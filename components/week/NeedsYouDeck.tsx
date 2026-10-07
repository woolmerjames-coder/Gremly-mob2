/**
 * What needs them: up to four cards from the weekly read, side by side to
 * swipe through. They can open any one to talk it through with Gremly, or
 * leave them be; Gremly does not lead them through each one.
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WEEK_COPY } from '../../lib/week/review/words';
import { WEEK, weekStyles } from './weekStyles';
import { WEEK_MASCOTS } from './weekMascots';

// one Gremly for each place in the deck
const FACES = [
  { source: WEEK_MASCOTS.running, head: '#E2ECE4' },
  { source: WEEK_MASCOTS.fitness, head: '#FBF1DC' },
  { source: WEEK_MASCOTS.sleepy, head: '#FBEDE3' },
  { source: WEEK_MASCOTS.laptop, head: '#EEF3EF' },
];

export interface NeedsYouDeckProps {
  cards: {
    title: string;
    why: string;
    /** What was decided on it, once something was */
    status?: string | null;
  }[];
  /** The one opened to talk through */
  talking: number | null;
  editable: boolean;
  disabled?: boolean;
  onTalk: (index: number) => void;
  onDone: () => void;
  onJustPlan: () => void;
}

export function NeedsYouDeck(p: NeedsYouDeckProps) {
  return (
    <View style={styles.wrap} testID="week-needs-you">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.deck}
      >
        {p.cards.map((c, i) => {
          const face = FACES[i % FACES.length];
          return (
            <View key={i} style={[styles.card, p.talking === i && styles.cardOn]}>
              <View style={[styles.head, { backgroundColor: face.head }]}>
                <Image source={face.source} style={styles.face} />
              </View>
              <View style={styles.body}>
                <Text style={styles.title}>{c.title}</Text>
                <Text style={styles.why}>{c.why}</Text>
                {c.status ? <Text style={styles.status}>{c.status}</Text> : null}
                {p.editable ? (
                  <TouchableOpacity
                    style={[
                      styles.talk,
                      !!c.status && styles.talkAgain,
                      p.disabled && weekStyles.off,
                    ]}
                    onPress={() => p.onTalk(i)}
                    disabled={p.disabled}
                    accessibilityRole="button"
                    testID={`week-needs-talk-${i}`}
                  >
                    <Text style={[styles.talkText, !!c.status && styles.talkTextAgain]}>
                      {c.status ? WEEK_COPY.change : WEEK_COPY.talk}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {p.editable ? (
        <>
          <TouchableOpacity
            style={[weekStyles.second, p.disabled && weekStyles.off]}
            onPress={p.onDone}
            disabled={p.disabled}
            accessibilityRole="button"
            testID="week-needs-done"
          >
            <Text style={weekStyles.secondText}>{WEEK_COPY.enough}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={weekStyles.link}
            onPress={p.onJustPlan}
            disabled={p.disabled}
            accessibilityRole="button"
          >
            <Text style={weekStyles.linkText}>{WEEK_COPY.justPlan}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  // the deck runs to the screen's edges, past the thread's side padding
  scroll: { marginHorizontal: -16 },
  deck: { gap: 10, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6 },
  card: {
    width: 210,
    backgroundColor: WEEK.white,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardOn: { borderColor: WEEK.green },
  head: { height: 96, alignItems: 'center', justifyContent: 'flex-end' },
  face: { width: 86, height: 86 },
  body: { flex: 1, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12, gap: 6 },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, lineHeight: 19, color: WEEK.ink },
  why: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, color: WEEK.muted },
  status: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: WEEK.green,
    backgroundColor: WEEK.wash,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  talk: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: WEEK.green,
    backgroundColor: WEEK.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkAgain: { backgroundColor: WEEK.white },
  talkText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13, color: WEEK.linen },
  talkTextAgain: { color: WEEK.green },
});
