/**
 * One of Gremly's questions about a Chapter, as a card (Worlds rebuild, stage
 * 3, the mockup's "Gremly noticed"): a suggestion with the items it rests on,
 * or a Chapter that looks finished, with the card's own two buttons and a line
 * to answer in their own words (lib/worlds/questions.ts).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ArrowUp,
  Lightbulb,
  ListChecks,
  Repeat,
  StickyNote,
  type LucideIcon,
} from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Habit, Note, Todo } from '../../lib/types';
import { askWords, type AskAct, type WorldsQuestion } from '../../lib/worlds/questions';
import { dateWords } from '../../lib/worlds/model';
import { F, W } from '../../lib/worlds/look';
import { Diamond } from './parts';
import { Btn } from './Sheet';
import { noteTitle } from './Kept';
import { stepTitle } from './UpNextCard';

type Row = { id: string; title: string; icon: LucideIcon; word: string };

/** The items a suggestion rests on that are still theirs, in its order. */
function useRestsOn(q: WorldsQuestion): Row[] {
  const todos = useGremlyStore((s) => s.todos) as Todo[] | undefined;
  const notes = useGremlyStore((s) => s.notes) as Note[] | undefined;
  const habits = useGremlyStore((s) => s.habits) as Habit[] | undefined;
  return useMemo(() => {
    const out: Row[] = [];
    for (const r of q.rests_on) {
      if (r.table === 'todos') {
        const t = (todos ?? []).find((x) => x.id === r.id);
        if (t) out.push({ id: t.id, title: stepTitle(t), icon: ListChecks, word: 'Todo' });
      } else if (r.table === 'notes') {
        const n = (notes ?? []).find((x) => x.id === r.id);
        if (n)
          out.push({
            id: n.id,
            title: noteTitle(n),
            icon: n.subtype === 'idea' ? Lightbulb : StickyNote,
            word: n.subtype === 'idea' ? 'Idea' : 'Note',
          });
      } else if (r.table === 'habits') {
        const h = (habits ?? []).find((x) => x.id === r.id);
        if (h)
          out.push({ id: h.id, title: String(h.name || '').trim(), icon: Repeat, word: 'Habit' });
      }
    }
    return out.filter((x) => x.title);
  }, [q.rests_on, todos, notes, habits]);
}

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
  const items = useRestsOn(q);
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
            <View key={r.id} style={styles.item}>
              <r.icon size={17} color={W.moss} />
              <Text style={styles.itemText}>{r.title}</Text>
              <Text style={styles.itemWord}>{r.word}</Text>
            </View>
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
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  itemText: { flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 20, color: W.ink },
  itemWord: { fontFamily: F.body, fontSize: 13.5, color: W.muted },
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
