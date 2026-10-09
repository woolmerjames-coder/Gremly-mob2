/**
 * Their own things, as rows: what a suggestion rests on, or what already
 * belongs in a Chapter being started. Only what is still theirs is shown.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Check,
  Lightbulb,
  ListChecks,
  Repeat,
  StickyNote,
  type LucideIcon,
} from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Habit, Note, Todo } from '../../lib/types';
import type { FiledItem } from '../../lib/worlds/actions';
import { F, W } from '../../lib/worlds/look';
import { noteTitle } from './Kept';
import { stepTitle } from './UpNextCard';

export type ItemRowData = FiledItem & { title: string; icon: LucideIcon; word: string };

/** The items that are still theirs, in the order given. */
export function useItemRows(items: FiledItem[]): ItemRowData[] {
  const todos = useGremlyStore((s) => s.todos) as Todo[] | undefined;
  const notes = useGremlyStore((s) => s.notes) as Note[] | undefined;
  const habits = useGremlyStore((s) => s.habits) as Habit[] | undefined;
  return useMemo(() => {
    const out: ItemRowData[] = [];
    for (const r of items) {
      if (r.type === 'todo') {
        const t = (todos ?? []).find((x) => x.id === r.id);
        if (t) out.push({ ...r, title: stepTitle(t), icon: ListChecks, word: 'Todo' });
      } else if (r.type === 'note') {
        const n = (notes ?? []).find((x) => x.id === r.id);
        if (n)
          out.push({
            ...r,
            title: noteTitle(n),
            icon: n.subtype === 'idea' ? Lightbulb : StickyNote,
            word: n.subtype === 'idea' ? 'Idea' : 'Note',
          });
      } else if (r.type === 'habit') {
        const h = (habits ?? []).find((x) => x.id === r.id);
        if (h) out.push({ ...r, title: String(h.name || '').trim(), icon: Repeat, word: 'Habit' });
      }
    }
    return out.filter((x) => x.title);
  }, [items, todos, notes, habits]);
}

/** One of their things; with onToggle, a tick to leave it out or keep it in. */
export function ItemRow({
  row,
  on,
  onToggle,
}: {
  row: ItemRowData;
  on?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      <row.icon size={17} color={W.moss} />
      <Text style={[styles.text, onToggle && !on && styles.off]}>{row.title}</Text>
      {onToggle ? (
        <View style={[styles.box, on && styles.boxOn]}>
          {on ? <Check size={13} color={W.linen} strokeWidth={3} /> : null}
        </View>
      ) : (
        <Text style={styles.word}>{row.word}</Text>
      )}
    </>
  );
  if (!onToggle) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onToggle}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!on }}
      accessibilityLabel={`${row.title}, ${row.word}`}
      testID={`item-row-${row.id}`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  text: { flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 20, color: W.ink },
  off: { color: W.faint, textDecorationLine: 'line-through' },
  word: { fontFamily: F.body, fontSize: 13.5, color: W.muted },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: W.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: W.moss, borderColor: W.moss },
});
