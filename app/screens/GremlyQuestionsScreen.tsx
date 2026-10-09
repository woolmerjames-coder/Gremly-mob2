/**
 * A few questions for you (data fabric stage 4f, the mockup James approved on
 * 8 October): Gremly's questions that may be asked today, one at a time,
 * those that need an answer first. Opened from Answer some Gremly questions
 * on Ask Gremly, and from Your story.
 *
 * Each answer goes through the same path as a correction, so it updates
 * everything: a tap sends the answer offered, Something else their own words.
 * A tidy up (inngest-jobs context/review.js) is done only on their tap: its
 * yes for every fact it lists, its no for none, or Some of them for the ones
 * they tick. Not now leaves the question for another day (asked_at), and
 * nothing about their life changes.
 *
 * A question about a Chapter is put as the Worlds card, with the items it
 * rests on and its own two buttons (components/worlds/QuestionAskCard), and
 * its receipt can put back what the tap did.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronLeft, Circle, CircleCheck } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useAskQuestions } from '../../lib/questions/useAskQuestions';
import type { AskQuestion } from '../../lib/questions/askQuestions';
import { answerQuestion, markQuestionAsked } from '../../lib/story/storyApi';
import { isChapterQuestionKind } from '../../lib/worlds/questions';
import type { Undo } from '../../lib/worlds/actions';
import { QuestionAskCard } from '../../components/worlds/QuestionAskCard';

const C = lightTokens.colors;

const KEPT_ASIDE = 'Gremly just stops treating them as part of your story.';
const FAILED = 'That didn’t send. Try again in a moment.';

/** What the receipt says once a question is answered, and what puts it back when there is something to. */
type Receipt = { id: string; title: string; line: string; undo?: Undo; undone?: boolean };

const PUT_BACK = 'Put back as it was.';
const NOT_PUT_BACK = 'That didn’t undo. Try again in a moment.';

/** The receipt's line for their answer: what they chose, and what it did. Pure. */
export function receiptLine(
  q: AskQuestion,
  answer: { said: string; typed?: boolean; picked?: number },
): string {
  const t = q.tidy;
  if (t) {
    const yes = answer.said === t.yes;
    const some = yes && answer.picked != null && answer.picked < t.fact_ids.length;
    if (!yes) return 'Kept as they are.';
    if (t.type === 'happened') return some ? `${answer.picked} marked as done.` : 'Marked as done.';
    const done = some ? `${answer.picked} forgotten.` : 'Forgotten.';
    return t.from_calendar ? `${done} Your calendar still has them.` : done;
  }
  // an answer about someone, or about what Gremly was not sure of, is noted; nothing shown is written again for it
  const noted = q.kind === 'person' || q.kind === 'unsure' ? 'Noted.' : 'Updated everywhere.';
  return answer.typed ? `Thanks. ${noted}` : `${answer.said}. ${noted}`;
}

/** How a question waiting further on is named in Still to come. Pure. */
export function stillToCome(q: AskQuestion): string {
  if (q.tidy) return q.topic ? `A tidy up: ${q.topic}` : 'A tidy up';
  return q.question;
}

type Mode = 'choose' | 'typing' | 'some';

export default function GremlyQuestionsScreen() {
  const nav = useNavigation<any>();
  const { askable, loaded } = useAskQuestions({ navigation: nav });
  // the questions as they stood when the screen opened, so an answer never reorders them
  const [list, setList] = useState<AskQuestion[] | null>(null);
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<Mode>('choose');
  const [text, setText] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  useEffect(() => {
    if (loaded && list == null) setList(askable);
  }, [loaded, askable, list]);

  const total = list?.length ?? 0;
  const q = list && at < total ? list[at] : null;

  function next() {
    setAt((i) => i + 1);
    setMode('choose');
    setText('');
    setTicked([]);
    setFailed(false);
  }

  async function send(said: string, how: { typed?: boolean; pick?: string[] } = {}) {
    if (!q || !said.trim() || sending) return;
    setSending(true);
    setFailed(false);
    const ok = await answerQuestion(q.id, said.trim(), how.pick);
    setSending(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setReceipts((r) => [
      ...r,
      {
        id: q.id,
        title: q.topic || q.question,
        line: receiptLine(q, { said: said.trim(), typed: how.typed, picked: how.pick?.length }),
      },
    ]);
    next();
  }

  /** The Worlds card answered a question about a Chapter. */
  function answeredOnCard(done: { line: string; undo?: Undo }) {
    if (!q) return;
    setReceipts((r) => [
      ...r,
      { id: q.id, title: q.topic || q.question, line: done.line, undo: done.undo },
    ]);
    next();
  }

  async function putBack(id: string) {
    const r = receipts.find((x) => x.id === id);
    if (!r?.undo || r.undone) return;
    const mark = (line: string, undone: boolean) =>
      setReceipts((all) => all.map((x) => (x.id === id ? { ...x, line, undone } : x)));
    try {
      await r.undo();
      mark(PUT_BACK, true);
    } catch (err) {
      console.warn('[Questions] could not put it back:', err);
      mark(NOT_PUT_BACK, false);
    }
  }

  async function notNow() {
    if (!q || sending) return;
    // it waits a few days before it is asked anywhere again; nothing about their life changes
    markQuestionAsked(q.id).catch((err) =>
      console.warn('[Questions] could not leave it for now:', err),
    );
    next();
  }

  const header = (
    <View style={styles.top}>
      <Pressable
        onPress={() => nav.goBack()}
        style={styles.back}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ChevronLeft size={22} color={C.mossGreen} />
      </Pressable>
      {q ? (
        <Text style={styles.count} testID="questions-count">
          {at + 1} of {total}
        </Text>
      ) : null}
    </View>
  );

  if (!list) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <ActivityIndicator color={C.mossGreen} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  // every question answered or left for now
  if (!q) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
        <ScrollView contentContainerStyle={styles.doneContent}>
          <Text style={styles.h1}>A few questions for you</Text>
          {!total ? (
            <Text style={styles.sub}>
              Nothing right now. When your records leave something unclear, it shows up here.
            </Text>
          ) : null}
          <View style={styles.receipts}>
            {receipts.map((r) => (
              <View key={r.id} style={styles.receipt} testID={`receipt-${r.id}`}>
                <Text style={styles.receiptTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <View style={styles.receiptRow}>
                  <Check size={14} color={C.mossGreen} strokeWidth={2.4} />
                  <Text style={styles.receiptText}>{r.line}</Text>
                  {r.undo && !r.undone ? (
                    <Pressable
                      onPress={() => void putBack(r.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Undo"
                      testID={`receipt-undo-${r.id}`}
                    >
                      <Text style={styles.receiptUndo}>Undo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          {total ? (
            <Text style={styles.doneLine}>
              {receipts.length
                ? 'That’s everything for now. Thank you.'
                : 'That’s everything for now.'}
            </Text>
          ) : null}
        </ScrollView>
        <View style={styles.doneFoot}>
          <Pressable
            onPress={() => nav.goBack()}
            style={styles.primary}
            accessibilityRole="button"
            testID="questions-done"
          >
            <Text style={styles.primaryText}>Back to Ask Gremly</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const tidy = q.tidy;
  const chapter = isChapterQuestionKind(q.kind);
  const label = tidy ? 'A TIDY UP' : q.weight === 'needs' ? 'NEEDS AN ANSWER' : null;
  const later = list.slice(at + 1, at + 4);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleBlock}>
          <Text style={styles.h1}>A few questions for you</Text>
          {at === 0 ? (
            <Text style={styles.sub}>
              I’d rather ask than guess. Each answer updates everything straight away.
            </Text>
          ) : null}
        </View>

        <View style={styles.progress}>
          {list.map((x, i) => (
            <View key={x.id} style={[styles.segment, i <= at && styles.segmentOn]} />
          ))}
        </View>

        {chapter ? (
          <View style={styles.chapterCard} testID={`question-${q.id}`}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <QuestionAskCard key={q.id} id={q.id} onDone={answeredOnCard} onGone={next} />
          </View>
        ) : (
          <View style={styles.card} testID={`question-${q.id}`}>
            {label ? <Text style={[styles.label, tidy && styles.labelTidy]}>{label}</Text> : null}
            <Text style={styles.question}>{q.question}</Text>
            {!tidy && q.why ? <Text style={styles.why}>{q.why}</Text> : null}

            {tidy && tidy.statements.length ? (
              <View style={styles.list}>
                {tidy.statements.map((s, i) => {
                  const id = tidy.fact_ids[i];
                  const on = ticked.includes(id);
                  const row = (
                    <>
                      {mode === 'some' ? (
                        on ? (
                          <CircleCheck size={18} color={C.mossGreen} />
                        ) : (
                          <Circle size={18} color="rgba(46,85,64,0.35)" />
                        )
                      ) : null}
                      <Text style={styles.listText}>{s}</Text>
                    </>
                  );
                  return mode === 'some' && id ? (
                    <Pressable
                      key={`${i}-${s}`}
                      style={styles.listRow}
                      onPress={() =>
                        setTicked((t) => (on ? t.filter((x) => x !== id) : [...t, id]))
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      testID={`tidy-row-${i}`}
                    >
                      {row}
                    </Pressable>
                  ) : (
                    <View key={`${i}-${s}`} style={styles.listRow}>
                      {row}
                    </View>
                  );
                })}
              </View>
            ) : null}
            {tidy?.type === 'set_aside' ? (
              <Text style={styles.why}>
                {tidy.from_calendar
                  ? `Your calendar keeps them. ${KEPT_ASIDE}`
                  : `Nothing is deleted. ${KEPT_ASIDE}`}
              </Text>
            ) : null}

            {failed ? <Text style={styles.failed}>{FAILED}</Text> : null}

            {mode === 'typing' ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Your answer"
                  placeholderTextColor="rgba(26,58,40,0.45)"
                  multiline
                  autoFocus
                  style={styles.input}
                  accessibilityLabel={`Answer: ${q.question}`}
                />
                <View style={styles.row}>
                  <Pressable
                    onPress={() => send(text, { typed: true })}
                    disabled={!text.trim() || sending}
                    style={[styles.send, (!text.trim() || sending) && { opacity: 0.5 }]}
                    accessibilityRole="button"
                  >
                    {sending ? (
                      <ActivityIndicator color={C.linenCream} />
                    ) : (
                      <Text style={styles.sendText}>Send</Text>
                    )}
                  </Pressable>
                  {q.choices.length ? (
                    <Pressable
                      onPress={() => setMode('choose')}
                      style={styles.ghost}
                      accessibilityRole="button"
                    >
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : tidy ? (
              <View style={styles.buttons}>
                {mode === 'some' ? (
                  <>
                    <Pressable
                      onPress={() => send(tidy.yes, { pick: ticked })}
                      disabled={!ticked.length || sending}
                      style={[styles.tidyButton, (!ticked.length || sending) && { opacity: 0.5 }]}
                      accessibilityRole="button"
                      testID="tidy-some-yes"
                    >
                      <Text style={styles.tidyText}>{tidy.yes}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setMode('choose');
                        setTicked([]);
                      }}
                      style={styles.other}
                      accessibilityRole="button"
                    >
                      <Text style={styles.otherText}>Cancel</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => send(tidy.yes)}
                      disabled={sending}
                      style={styles.tidyButton}
                      accessibilityRole="button"
                      testID="tidy-yes"
                    >
                      <Text style={styles.tidyText}>{tidy.yes}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => send(tidy.no)}
                      disabled={sending}
                      style={styles.tidyButton}
                      accessibilityRole="button"
                      testID="tidy-no"
                    >
                      <Text style={styles.tidyText}>{tidy.no}</Text>
                    </Pressable>
                    {tidy.statements.length > 1 ? (
                      <Pressable
                        onPress={() => setMode('some')}
                        disabled={sending}
                        style={styles.other}
                        accessibilityRole="button"
                        testID="tidy-some"
                      >
                        <Text style={styles.otherText}>Some of them</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            ) : (
              <View style={styles.buttons}>
                {q.choices.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => send(c)}
                    disabled={sending}
                    style={styles.choice}
                    accessibilityRole="button"
                  >
                    <Text style={styles.choiceText}>{c}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setMode('typing')}
                  disabled={sending}
                  style={styles.other}
                  accessibilityRole="button"
                  testID="something-else"
                >
                  <Text style={styles.otherText}>
                    {q.choices.length ? 'Something else' : 'Answer'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.notNowRow}>
          <Pressable
            onPress={notNow}
            disabled={sending}
            style={styles.notNow}
            accessibilityRole="button"
            testID="not-now"
          >
            {/* the card has its own Not now, which means no; this one only leaves it for another day */}
            <Text style={styles.notNowText}>{chapter ? 'Skip for now' : 'Not now'}</Text>
          </Pressable>
        </View>

        {later.length ? (
          <View style={styles.later}>
            <Text style={styles.laterLabel}>STILL TO COME</Text>
            {later.map((x) => (
              <Text key={x.id} style={styles.laterText} numberOfLines={1}>
                {stillToCome(x)}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.linenCream },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 10,
    paddingRight: 18,
    paddingTop: 4,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(26,58,40,0.6)' },
  content: { paddingBottom: 48 },
  titleBlock: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
  h1: { fontFamily: 'Fraunces-SemiBold', fontSize: 28, lineHeight: 32, color: C.worldsInk },
  sub: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: '#4D5A52' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingTop: 18 },
  segment: { height: 4, flex: 1, borderRadius: 2, backgroundColor: '#D9DCEA' },
  segmentOn: { backgroundColor: '#4A4E7A' },
  card: {
    marginTop: 20,
    marginHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.worldsCardBorder,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    gap: 14,
  },
  // the Worlds card brings its own colour and corners
  chapterCard: { marginTop: 20, marginHorizontal: 16, gap: 10 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 0.5, color: '#4A4E7A' },
  labelTidy: { color: '#3C6150' },
  question: { fontFamily: 'Inter-Regular', fontSize: 18, lineHeight: 26, color: C.worldsInk },
  why: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, color: '#4D5A52' },
  list: { borderTopWidth: 1, borderTopColor: 'rgba(46,85,64,0.10)' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(46,85,64,0.10)',
  },
  listText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: C.worldsInk,
  },
  buttons: { gap: 8 },
  choice: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(74,78,122,0.30)',
    backgroundColor: '#ECEEFA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  choiceText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#2B2F55', textAlign: 'center' },
  tidyButton: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#DCE6DB',
    backgroundColor: '#EEF3ED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tidyText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#2E4A3A', textAlign: 'center' },
  other: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.18)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  otherText: { fontFamily: 'Inter-Medium', fontSize: 15, color: '#2E4A3A' },
  input: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.18)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 21,
    color: C.worldsInk,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  send: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    backgroundColor: C.mossGreen,
    justifyContent: 'center',
  },
  sendText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: C.linenCream },
  ghost: { minHeight: 42, paddingHorizontal: 10, justifyContent: 'center' },
  ghostText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#4D5A52' },
  failed: { fontFamily: 'Inter-Regular', fontSize: 13, color: C.danger },
  notNowRow: { alignItems: 'center', paddingTop: 12 },
  notNow: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  notNowText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#4D5A52' },
  later: { paddingHorizontal: 20, paddingTop: 28, gap: 8 },
  laterLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    color: 'rgba(26,58,40,0.6)',
  },
  laterText: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: '#4D5A52' },
  doneContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  receipts: { marginTop: 24, gap: 10 },
  receipt: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.worldsCardBorder,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  receiptTitle: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 21, color: C.worldsInk },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13, color: C.mossGreen },
  receiptUndo: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: C.mossGreen, paddingLeft: 8 },
  doneLine: {
    paddingTop: 24,
    paddingHorizontal: 2,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#4D5A52',
  },
  doneFoot: { paddingHorizontal: 18, paddingBottom: 16 },
  primary: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: C.mossGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: C.linenCream },
});
