/**
 * A list or a note, opened from Kept here. A list ticks in place, takes new
 * items, and on a Chapter can turn an item into a step.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUpRight, Check, Plus, StickyNote } from 'lucide-react-native';
import type { Note } from '../../lib/types';
import { F, W } from '../../lib/worlds/look';
import { isList } from '../../lib/worlds/model';
import { SheetNote, SheetTitle } from './Sheet';
import { noteTitle } from './Kept';
import { TextLink } from './parts';

type Row = { id: string; text: string; checked: boolean };

export function KeptOpen({
  note,
  where,
  onRows,
  onMakeStep,
  onTakeOut,
}: {
  note: Note;
  /** Chapter or World, for the words */
  where: 'Chapter' | 'World';
  onRows: (rows: Row[]) => void;
  /** Only on a Chapter */
  onMakeStep?: (text: string) => void;
  onTakeOut: () => void;
}) {
  const [text, setText] = useState('');
  const rows: Row[] = note.list_items || [];
  const ticked = rows.filter((r) => r.checked).length;

  if (!isList(note)) {
    return (
      <View>
        <SheetTitle>{noteTitle(note)}</SheetTitle>
        <View style={styles.meta}>
          <StickyNote size={14} color={W.moss} />
          <Text style={styles.metaText}>Note</Text>
        </View>
        {note.body?.trim() ? <Text style={styles.body}>{note.body.trim()}</Text> : null}
        <TextLink
          label={`Take it out of this ${where}`}
          onPress={onTakeOut}
          style={{ marginTop: 16, marginLeft: 4 }}
        />
      </View>
    );
  }

  function add() {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return;
    setText('');
    onRows([
      ...rows,
      {
        id: `item-${rows.length}-${Math.random().toString(36).slice(2, 8)}`,
        text: t,
        checked: false,
      },
    ]);
  }

  return (
    <View>
      <SheetTitle>{noteTitle(note)}</SheetTitle>
      <SheetNote>
        {`${ticked} of ${rows.length} ticked.`}
        {onMakeStep ? ' The arrow turns an item into a step.' : ''}
      </SheetNote>
      <View style={styles.ls}>
        {rows.map((r, i) => (
          <View key={r.id} style={[styles.lr, i > 0 && styles.line]}>
            <Pressable
              onPress={() =>
                onRows(rows.map((x) => (x.id === r.id ? { ...x, checked: !x.checked } : x)))
              }
              style={styles.lt}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: r.checked }}
              accessibilityLabel={r.text}
            >
              <View style={[styles.bx, r.checked && styles.bxOn]}>
                {r.checked ? <Check size={14} strokeWidth={3} color={W.linen} /> : null}
              </View>
              <Text style={[styles.ltText, r.checked && styles.ltOn]}>{r.text}</Text>
            </Pressable>
            {onMakeStep && !r.checked ? (
              <Pressable
                onPress={() => onMakeStep(r.text)}
                style={styles.ls2}
                accessibilityRole="button"
                accessibilityLabel={`Make this a step: ${r.text}`}
              >
                <ArrowUpRight size={17} color={W.moss} />
              </Pressable>
            ) : null}
          </View>
        ))}
        <View style={[styles.add, rows.length > 0 && styles.line]}>
          <Plus size={18} color={W.moss} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add an item"
            placeholderTextColor="#9a9a9a"
            returnKeyType="done"
            blurOnSubmit={false}
            onSubmitEditing={add}
            style={styles.addInput}
            accessibilityLabel="New item"
          />
        </View>
      </View>
      <TextLink
        label={`Take it out of this ${where}`}
        onPress={onTakeOut}
        style={{ marginTop: 16, marginLeft: 4 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: W.sageWash,
    marginHorizontal: 4,
    marginTop: 6,
  },
  metaText: { fontFamily: F.bodySemi, fontSize: 13, color: W.moss },
  body: {
    fontFamily: F.body,
    fontSize: 16,
    lineHeight: 24,
    color: W.ink,
    marginTop: 12,
    marginHorizontal: 4,
  },
  ls: {
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    borderRadius: 18,
    overflow: 'hidden',
    marginHorizontal: 2,
  },
  line: { borderTopWidth: 1, borderTopColor: W.line },
  lr: { flexDirection: 'row', alignItems: 'center' },
  lt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  bx: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: W.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bxOn: { backgroundColor: W.moss, borderColor: W.moss },
  ltText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 15.5, lineHeight: 20, color: W.ink },
  ltOn: { color: W.done, textDecorationLine: 'line-through' },
  ls2: {
    width: 40,
    height: 40,
    marginRight: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addInput: { flex: 1, fontFamily: F.body, fontSize: 16, color: W.ink, padding: 0, height: 30 },
});
