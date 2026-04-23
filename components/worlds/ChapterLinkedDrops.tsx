import { View, Pressable, StyleSheet } from 'react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useChapterDrops } from '../../lib/store/worldsSelectors';
import type { Chapter } from '../../lib/supabase/types';
import type { Todo, Note } from '../../lib/types';

interface ChapterLinkedDropsProps {
  chapter: Chapter;
}

export function ChapterLinkedDrops({ chapter }: ChapterLinkedDropsProps) {
  const drops = useChapterDrops(chapter.id);
  const open = drops.todos.filter((t) => !t.completed_at).slice(0, 5);
  const openCount = drops.todos.filter((t) => !t.completed_at).length;
  const done = drops.todos
    .filter((t) => !!t.completed_at)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 4);
  const doneCount = drops.todos.filter((t) => !!t.completed_at).length;
  const notes = drops.notes.slice(0, 3);

  return (
    <View>
      {openCount > 0 ? (
        <>
          <SectionHeader
            label={`TO DO · ${openCount} OPEN`}
            onSeeAll={openCount > 5 ? () => console.log('see all open') : undefined}
          />
          {open.map((t) => (
            <TodoRow key={t.id} todo={t} />
          ))}
        </>
      ) : null}

      {doneCount > 0 ? (
        <>
          <SectionHeader
            label={`DONE RECENTLY · ${doneCount}`}
            onSeeAll={doneCount > 4 ? () => console.log('see all done') : undefined}
          />
          {done.map((t) => (
            <TodoRow key={t.id} todo={t} done />
          ))}
        </>
      ) : null}

      {notes.length > 0 ? (
        <>
          <SectionHeader
            label="THOUGHTS IN THIS CHAPTER"
            onSeeAll={drops.notes.length > 3 ? () => console.log('see all notes') : undefined}
          />
          {notes.map((n) => (
            <ThoughtRow key={n.id} note={n} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function SectionHeader({ label, onSeeAll }: { label: string; onSeeAll?: () => void }) {
  return (
    <View style={sectionStyles.row}>
      <Text style={sectionStyles.lbl}>{label}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll}>
          <Text style={sectionStyles.seeAll}>see all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TodoRow({ todo, done }: { todo: Todo; done?: boolean }) {
  return (
    <View style={todoStyles.row}>
      <View style={[todoStyles.chk, done && todoStyles.chkOn]}>
        {done ? <View style={todoStyles.chkMark} /> : null}
      </View>
      <Text style={[todoStyles.text, done && todoStyles.textDone]} numberOfLines={2}>
        {todo.title || todo.name || '(untitled)'}
      </Text>
    </View>
  );
}

function ThoughtRow({ note }: { note: Note }) {
  return (
    <Pressable onPress={() => console.log('thought tap', note.id)} style={thoughtStyles.row}>
      <Text style={thoughtStyles.title} numberOfLines={2}>
        {note.title || 'untitled'}
      </Text>
      <Text style={thoughtStyles.meta}>
        {note.created_at?.slice(0, 10)}
        {note.subtype ? ` · ${note.subtype}` : ''}
      </Text>
    </Pressable>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 10,
  },
  lbl: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  seeAll: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '600',
    color: lightTokens.colors.deepForest,
  },
});

const todoStyles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom: 5,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.05)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chk: {
    width: 19,
    height: 19,
    borderWidth: 1.8,
    borderColor: '#97AF8F',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chkOn: { backgroundColor: '#97AF8F', borderColor: '#97AF8F' },
  chkMark: {
    width: 4,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: lightTokens.colors.linenCream,
    transform: [{ rotate: '45deg' }],
    marginTop: -2,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    color: lightTokens.colors.deepForest,
  },
  textDone: { textDecorationLine: 'line-through', color: '#A59E88' },
});

const thoughtStyles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom: 5,
    padding: 11,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(250,244,222,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(26,58,40,0.05)',
    borderRadius: 12,
  },
  title: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 17,
    color: lightTokens.colors.deepForest,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.warmGrey,
    marginTop: 3,
  },
});
