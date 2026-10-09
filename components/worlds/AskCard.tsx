/**
 * One of Gremly's questions about a Chapter, as a card (Worlds rebuild, stage
 * 3, the mockup's "Gremly noticed"): a suggestion with the items it rests on,
 * or a Chapter that looks finished, with the card's own two buttons and a line
 * to answer in their own words (lib/worlds/questions.ts).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUp } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { askWords, itemsOf, type AskAct, type WorldsQuestion } from '../../lib/worlds/questions';
import { dateWords } from '../../lib/worlds/model';
import { F, W } from '../../lib/worlds/look';
import { Diamond } from './parts';
import { Btn } from './Sheet';
import { ItemRow, useItemRows } from './ItemRows';

export function AskCard({
  question: q,
  busy,
  onAct,
  onTell,
}: {
  question: WorldsQuestion;
  busy?: boolean;
  onAct: (act: AskAct) => void;
  /** Their own words, for the pipeline to read */
  onTell: (said: string) => void;
}) {
  const chapters = useGremlyStore((s) => s.chapters) ?? [];
  const words = askWords(q, chapters);
  const refs = useMemo(() => itemsOf(q), [q]);
  const items = useItemRows(refs);
  const [said, setSaid] = useState('');
  const start = q.proposal.type === 'start';
  const when = start
    ? dateWords(q.proposal as { start_date: string | null; end_date: string | null })
    : '';
  const closes = words.primary.act === 'close' || words.secondary.act === 'close';

  return (
    <View style={[styles.card, start ? styles.peri : styles.pear]} testID="ask-card">
      <View style={styles.mark}>
        <Diamond size={9} />
        <Text style={styles.markText}>Gremly noticed</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {words.title}
      </Text>
      <Text style={[styles.body, { color: start ? W.periInk : W.pearInk }]}>
        {when ? `${when}. ` : ''}
        {q.question}
        {closes ? ' Closing it writes its memory for your story, and nothing in it is lost.' : ''}
      </Text>
      {items.length ? (
        <View style={styles.items} accessibilityLabel="What it rests on">
          {items.map((r) => (
            <ItemRow key={r.id} row={r} />
          ))}
        </View>
      ) : null}
      <View style={styles.acts}>
        <View style={{ flex: 1.6 }}>
          <Btn
            label={words.primary.label}
            disabled={busy}
            onPress={() => onAct(words.primary.act)}
            testID="ask-primary"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            kind="sec"
            label={words.secondary.label}
            disabled={busy}
            onPress={() => onAct(words.secondary.act)}
            testID="ask-secondary"
          />
        </View>
      </View>
      <View style={styles.say}>
        <TextInput
          value={said}
          onChangeText={setSaid}
          placeholder="Or tell Gremly in your own words"
          placeholderTextColor={W.faint}
          style={styles.sayInput}
          multiline
          editable={!busy}
          accessibilityLabel="Answer in your own words"
          testID="ask-say"
        />
        <Pressable
          onPress={() => {
            const s = said.trim();
            if (!s || busy) return;
            setSaid('');
            onTell(s);
          }}
          disabled={!said.trim() || busy}
          style={[styles.send, said.trim() ? styles.sendReady : null]}
          accessibilityRole="button"
          accessibilityLabel="Send to Gremly"
          testID="ask-send"
        >
          <ArrowUp size={18} color={said.trim() ? W.linen : W.moss} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 18, marginHorizontal: 2, marginBottom: 4 },
  peri: { backgroundColor: W.periWash },
  pear: { backgroundColor: W.pearWash },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  markText: {
    fontFamily: F.ui,
    fontSize: 12.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: W.off,
  },
  title: { fontFamily: F.ui, fontSize: 19, lineHeight: 24, color: W.forest },
  body: { fontFamily: F.body, fontSize: 15.5, lineHeight: 22, marginTop: 6 },
  items: { gap: 8, marginTop: 14 },
  acts: { flexDirection: 'row', gap: 10, marginTop: 16 },
  say: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
    backgroundColor: W.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: W.field,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  sayInput: {
    flex: 1,
    minHeight: 34,
    maxHeight: 110,
    fontFamily: F.body,
    fontSize: 15,
    color: W.ink,
    paddingTop: 7,
    paddingBottom: 7,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: W.sageWash,
  },
  sendReady: { backgroundColor: W.moss },
});
