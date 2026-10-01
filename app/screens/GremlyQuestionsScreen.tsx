/**
 * Things Gremly is unsure about: the open questions the context pipeline wrote
 * when the person's records left something unclear. Most are answered in the
 * brief or in chat; this list is for clearing them on purpose. An answer goes
 * through the same path as a correction, so it updates everything; Skip just
 * dismisses the question.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronLeft } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useOpenQuestions } from '../../lib/story/useStory';
import { answerQuestion, dismissQuestion, type GremlyQuestion } from '../../lib/story/storyApi';

const C = lightTokens.colors;

type CardState = { mode: 'idle' | 'answering' | 'sending' | 'answered' | 'skipped' | 'failed'; text: string };

export default function GremlyQuestionsScreen() {
  const nav = useNavigation();
  const { data: questions, loading } = useOpenQuestions();
  const [cards, setCards] = useState<Record<string, CardState>>({});

  const get = (id: string): CardState => cards[id] ?? { mode: 'idle', text: '' };
  const set = (id: string, next: Partial<CardState>) =>
    setCards((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { mode: 'idle', text: '' }), ...next } }));

  async function send(q: GremlyQuestion) {
    const text = get(q.id).text.trim();
    if (!text) return;
    set(q.id, { mode: 'sending' });
    const ok = await answerQuestion(q.id, text);
    set(q.id, { mode: ok ? 'answered' : 'failed' });
  }

  async function skip(q: GremlyQuestion) {
    set(q.id, { mode: 'sending' });
    try {
      await dismissQuestion(q.id);
      set(q.id, { mode: 'skipped' });
    } catch {
      set(q.id, { mode: 'failed' });
    }
  }

  const remaining = questions.filter((q) => !['answered', 'skipped'].includes(get(q.id).mode)).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => nav.goBack()} style={styles.back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={22} color={C.mossGreen} />
        </Pressable>
        <Text style={styles.h1}>Things I’m unsure about</Text>
        <Text style={styles.sub}>
          {questions.length && !remaining
            ? 'That’s everything for now. Thank you.'
            : 'Answer any, skip any. I’d rather ask than guess, and each answer updates everything straight away.'}
        </Text>

        {loading && !questions.length ? <ActivityIndicator color={C.mossGreen} style={{ marginTop: 30 }} /> : null}
        {!loading && !questions.length ? (
          <Text style={styles.sub}>Nothing right now. When your records leave something unclear, it shows up here.</Text>
        ) : null}

        {questions.map((q) => {
          const s = get(q.id);
          const closed = s.mode === 'answered' || s.mode === 'skipped';
          return (
            <View key={q.id} style={styles.card}>
              <View style={styles.qRow}>
                <View style={[styles.dot, closed && { backgroundColor: C.sageMist }]} />
                <Text style={styles.qText}>{q.question}</Text>
              </View>

              {closed ? (
                <View style={styles.result}>
                  <Check size={14} color={C.mossGreen} strokeWidth={2.4} />
                  <Text style={styles.resultText}>
                    {s.mode === 'answered' ? 'Thanks. Updating everything now.' : 'Skipped. No need to answer it.'}
                  </Text>
                </View>
              ) : s.mode === 'answering' || s.mode === 'sending' || s.mode === 'failed' ? (
                <View style={{ gap: 8, paddingLeft: 18 }}>
                  <TextInput
                    value={s.text}
                    onChangeText={(text) => set(q.id, { text })}
                    placeholder="Your answer"
                    placeholderTextColor="rgba(26,58,40,0.45)"
                    multiline
                    autoFocus
                    style={styles.input}
                    accessibilityLabel={`Answer: ${q.question}`}
                  />
                  {s.mode === 'failed' ? <Text style={styles.failed}>That didn’t send. Try again in a moment.</Text> : null}
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => send(q)}
                      disabled={!s.text.trim() || s.mode === 'sending'}
                      style={[styles.primary, (!s.text.trim() || s.mode === 'sending') && { opacity: 0.5 }]}
                      accessibilityRole="button"
                    >
                      {s.mode === 'sending' ? <ActivityIndicator color={C.linenCream} /> : <Text style={styles.primaryText}>Send</Text>}
                    </Pressable>
                    <Pressable onPress={() => set(q.id, { mode: 'idle' })} style={styles.ghost} accessibilityRole="button">
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={[styles.actions, { paddingLeft: 18 }]}>
                  <Pressable onPress={() => set(q.id, { mode: 'answering' })} style={styles.chip} accessibilityRole="button">
                    <Text style={styles.chipText}>Answer</Text>
                  </Pressable>
                  <Pressable onPress={() => skip(q)} style={styles.ghost} accessibilityRole="button">
                    <Text style={styles.ghostText}>Skip</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.linenCream },
  content: { paddingHorizontal: 18, paddingBottom: 60, gap: 12 },
  back: { width: 40, height: 40, justifyContent: 'center', marginTop: 4 },
  h1: { fontFamily: 'Fraunces-SemiBold', fontSize: 28, lineHeight: 32, color: C.worldsInk },
  sub: { fontFamily: 'Inter-Regular', fontSize: 13.5, lineHeight: 20, color: '#4D5A52', marginBottom: 6 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.worldsCardBorder,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  qRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: C.periwinkleSmoke },
  qText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 22, color: C.worldsInk },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(74,78,122,0.30)',
    backgroundColor: '#ECEEFA',
    justifyContent: 'center',
  },
  chipText: { fontFamily: 'Inter-Medium', fontSize: 13, fontWeight: '600', color: '#2B2F55' },
  ghost: { minHeight: 38, paddingHorizontal: 10, justifyContent: 'center' },
  ghostText: { fontFamily: 'Inter-Medium', fontSize: 13, fontWeight: '600', color: '#4D5A52' },
  primary: { minHeight: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.mossGreen, justifyContent: 'center' },
  primaryText: { fontFamily: 'Inter-Medium', fontSize: 13, fontWeight: '700', color: C.linenCream },
  input: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,85,64,0.18)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: C.worldsInk,
    textAlignVertical: 'top',
  },
  failed: { fontFamily: 'Inter-Regular', fontSize: 13, color: C.danger },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 18 },
  resultText: { fontFamily: 'Inter-Medium', fontSize: 13, fontWeight: '600', color: C.mossGreen },
});
