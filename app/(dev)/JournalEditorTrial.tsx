/**
 * JournalEditorTrial - a short trial of the rich text editor for the journal page.
 *
 * Piece 1 of the journal page build plan. It puts the real editor, the real
 * format bar and the real saving code on one screen, so the things that can
 * only be judged on a device are judged before the page is built on them:
 * the bar sitting on the keyboard, bold and italics in the app's font, lists,
 * paste, and a long entry.
 *
 * This screen is deleted once the editor is chosen.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRIEF } from '../../components/brief/briefStyles';
import {
  JournalEditor,
  NO_FORMAT,
  type FormatKind,
  type FormatState,
  type JournalEditorHandle,
} from '../../components/journal/JournalEditor';
import { JournalFormatBar } from '../../components/journal/JournalFormatBar';
import { JournalRichText } from '../../components/journal/JournalRichText';
import { useKeyboardLift } from '../../hooks/useKeyboardLift';
import { pageText, toLayout, type JournalLayout } from '../../lib/journal/page';

const LONG =
  '<html>' +
  '<p>Started slowly. The morning went on email and I did not get to the deck until ten, which is later than I wanted.</p>' +
  '<p>Once I was in it, it went well. <b>The middle section finally makes sense</b>, and I cut two slides that were only there because I was nervous.</p>' +
  '<ul><li>Deck sent to Priya</li><li>Called mum back</li><li>Ran before dinner</li></ul>' +
  '<p>The run was the best part. Cold, clear, nobody on the path. I thought about the spring trip most of the way round.</p>' +
  '<p>Things I want to remember from today:</p>' +
  '<ol><li>Start the hard thing before opening email</li><li>Lunch away from the desk</li><li>Say no to the third call</li></ol>' +
  '<p>Tomorrow is lighter. I would like to keep it that way, and <i>not</i> fill the gaps just because they are there.</p>' +
  '<p>One more paragraph so this runs well past the bottom of the screen. Keep typing after this line and watch whether the page follows the cursor or lets it slide behind the keyboard.</p>' +
  '</html>';

const STEPS = [
  'Tap a card and type. The bar should sit on top of the keyboard. If no keyboard shows in the simulator, press Command K.',
  'Tap B, type a word, tap B again. Is the word bold? Do the same with I. Does it slant?',
  'Tap the bullets button and type three lines. Press return twice to end the list. Then try numbers.',
  'Select a word you already typed and tap B.',
  'Copy text from Safari or Notes and paste it in.',
  'Tap Fill a long entry, then type at the very end. Does the page follow the cursor?',
  'Switch the font to System and try bold and italics again.',
  'Tap Show what would be saved and check it matches what you wrote.',
];

type TrialCard = { id: string; q: string | null; html: string };
type Saved = { text: string; layout: JournalLayout };

export default function JournalEditorTrial() {
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const [system, setSystem] = useState(false);
  const [long, setLong] = useState(0);
  const [format, setFormat] = useState<FormatState>(NO_FORMAT);
  const [words, setWords] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Saved | null>(null);
  const editors = useRef<Record<string, JournalEditorHandle | null>>({});
  const active = useRef<string>('free');

  const cards: TrialCard[] = useMemo(
    () => [
      { id: 'proud', q: 'What am I proud of today?', html: '' },
      { id: 'grateful', q: 'What am I grateful for?', html: '' },
      { id: 'free', q: null, html: long ? LONG : '' },
    ],
    [long],
  );

  const count = Object.values(words).join(' ').trim().split(/\s+/).filter(Boolean).length;

  const toggle = (kind: FormatKind) => editors.current[active.current]?.toggle(kind);

  const show = async () => {
    const filled = await Promise.all(
      cards.map(async (c) => ({ ...c, html: (await editors.current[c.id]?.html()) ?? c.html })),
    );
    const page = { tpl: 'proud', cards: filled };
    Keyboard.dismiss();
    setSaved({ text: pageText(page), layout: toLayout(page) });
  };

  const font = system ? 'System' : undefined;
  const barBottom = lift.interpolate({
    inputRange: [0, insets.bottom + 1, 2000],
    outputRange: [insets.bottom + 8, insets.bottom + 9, 2008],
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        testID="journal-trial-scroll"
      >
        <Text style={styles.kicker}>Journal · editor trial</Text>
        <Text style={styles.title}>Try the editor</Text>
        <View style={styles.rule} />

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text style={styles.stepN}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.chip, !system && styles.chipOn]}
            onPress={() => setSystem(false)}
            accessibilityRole="button"
            testID="journal-trial-font-inter"
          >
            <Text style={[styles.chipText, !system && styles.chipTextOn]}>Font: Inter</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, system && styles.chipOn]}
            onPress={() => setSystem(true)}
            accessibilityRole="button"
            testID="journal-trial-font-system"
          >
            <Text style={[styles.chipText, system && styles.chipTextOn]}>Font: System</Text>
          </Pressable>
        </View>

        {cards.map((c, i) => {
          const has = !!(words[c.id] ?? '').trim();
          return (
            <View key={`${c.id}-${long}-${system ? 's' : 'i'}`} style={styles.card}>
              {c.q ? (
                <View style={styles.cardHead}>
                  <View style={[styles.badge, has && styles.badgeOn]}>
                    <Text style={[styles.badgeText, has && styles.badgeTextOn]}>
                      {has ? '✓' : i + 1}
                    </Text>
                  </View>
                  <Text style={styles.prompt}>{c.q}</Text>
                </View>
              ) : null}
              <JournalEditor
                ref={(h) => {
                  editors.current[c.id] = h;
                }}
                initialHtml={c.html}
                placeholder={c.q ? 'Write here...' : 'Anything else...'}
                minHeight={c.q ? 44 : 96}
                fontFamily={font}
                onFocus={() => {
                  active.current = c.id;
                }}
                onChangeText={(text) => setWords((w) => ({ ...w, [c.id]: text }))}
                onFormat={(s) => {
                  if (active.current === c.id) setFormat(s);
                }}
                testID={`journal-trial-editor-${c.id}`}
              />
            </View>
          );
        })}

        <View style={styles.row}>
          <Pressable
            style={styles.btn}
            onPress={() => {
              setSaved(null);
              setWords({});
              setLong((n) => n + 1);
            }}
            accessibilityRole="button"
            testID="journal-trial-long"
          >
            <Text style={styles.btnText}>Fill a long entry</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => void show()}
            accessibilityRole="button"
            testID="journal-trial-show"
          >
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Show what would be saved</Text>
          </Pressable>
        </View>

        {saved ? (
          <View style={styles.saved} testID="journal-trial-saved">
            <Text style={styles.label}>The plain words Gremly and other screens read</Text>
            <Text style={styles.plain} selectable testID="journal-trial-text">
              {saved.text || '(nothing written)'}
            </Text>
            <Text style={styles.label}>As it reads when you look back</Text>
            {saved.layout.cards.map((c, i) => (
              <View key={`${i}-${c.q ?? 'free'}`} style={styles.card}>
                {c.q ? <Text style={styles.prompt}>{c.q}</Text> : null}
                <JournalRichText html={c.html} fontFamily={font} />
              </View>
            ))}
            <Text style={styles.label}>What is kept, for Claude to check</Text>
            <Text style={styles.raw} selectable testID="journal-trial-raw">
              {JSON.stringify(saved.layout.cards)}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Animated.View style={[styles.bar, { bottom: barBottom }]}>
        <JournalFormatBar
          state={format}
          onToggle={toggle}
          onPhoto={undefined}
          count={`${count} ${count === 1 ? 'word' : 'words'}`}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRIEF.linen },
  content: { padding: 16, paddingBottom: 140, gap: 12 },
  kicker: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: BRIEF.periInk,
  },
  title: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 30, color: BRIEF.moss, marginTop: -6 },
  rule: { width: 72, height: 4, borderRadius: 2, backgroundColor: BRIEF.moss },
  steps: {
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRIEF.line,
    padding: 14,
    gap: 8,
  },
  step: { flexDirection: 'row', gap: 10 },
  stepN: { width: 16, fontFamily: 'Inter-SemiBold', fontSize: 13, color: BRIEF.moss },
  stepText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: BRIEF.mossInk,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: BRIEF.moss, borderColor: BRIEF.moss },
  chipText: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: BRIEF.moss },
  chipTextOn: { color: BRIEF.white },
  card: {
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRIEF.line,
    padding: 14,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BRIEF.sageWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { backgroundColor: BRIEF.moss },
  badgeText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: BRIEF.moss },
  badgeTextOn: { color: BRIEF.white },
  prompt: { flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 16, color: BRIEF.mossInk },
  btn: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: BRIEF.chipBorder,
    backgroundColor: BRIEF.white,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  btnPrimary: { backgroundColor: BRIEF.moss, borderColor: BRIEF.moss },
  btnText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: BRIEF.moss },
  btnTextPrimary: { color: BRIEF.white },
  saved: { gap: 10 },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: BRIEF.faint,
    marginTop: 6,
  },
  plain: {
    fontFamily: 'Inter-Regular',
    fontSize: 14.5,
    lineHeight: 21,
    color: BRIEF.mossInk,
    backgroundColor: BRIEF.linen2,
    borderRadius: 12,
    padding: 12,
  },
  raw: { fontFamily: 'Courier', fontSize: 11, lineHeight: 15, color: BRIEF.muted },
  bar: { position: 'absolute', left: 14, right: 14 },
});
