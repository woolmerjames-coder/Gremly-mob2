/**
 * A World, in look A: its name and Gremly on its own colour, its words, the
 * Chapters in motion, its open todos, habits and what is kept in it, and the
 * Chapters it has closed. The box at the foot opens its chat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EyeOff, Merge, Pencil } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAppEventOnFocus } from '../../lib/appEvents';
import { getDateService } from '../../lib/date/DateService';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Note } from '../../lib/types';
import type { World } from '../../lib/supabase/types';
import { useWorldsData } from '../../lib/worlds/useWorldsData';
import { showFailed, showSnack } from '../../lib/worlds/snack';
import { F, TINT, W } from '../../lib/worlds/look';
import {
  chapterSteps,
  habitWeek,
  isShownWorld,
  worldChapters,
  worldGremly,
  worldLoose,
  worldName,
  worldTint,
} from '../../lib/worlds/model';
import { ChapterRow, ClosedRow } from '../../components/worlds/ChapterRow';
import { GremlyImage } from '../../components/worlds/GremlyFace';
import { PageTop } from '../../components/worlds/PageTop';
import { WordsBlock } from '../../components/worlds/WordsBlock';
import { AddStepRow, StepRow } from '../../components/worlds/Steps';
import { HabitRows, KeptStrip } from '../../components/worlds/Kept';
import { KeptOpen } from '../../components/worlds/KeptOpen';
import { NoneYet, SectionHead, plural } from '../../components/worlds/parts';
import { MenuRow, Sheet, SheetTitle } from '../../components/worlds/Sheet';
import { GremlyPick } from '../../components/worlds/GremlyPick';
import { WorldPick } from '../../components/worlds/WorldPick';
import { TextEdit } from '../../components/worlds/TextEdit';
import { GremlyBox, BOX_SPACE } from '../../components/worlds/GremlyBox';
import { PageChat } from '../../components/worlds/PageChat';
import { UndoSnack } from '../../components/worlds/UndoSnack';
import { usePageActions } from '../../components/worlds/usePageActions';

type RouteT = RouteProp<RootStackParamList, 'WorldDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'WorldDetail'>;
type WorldSheet =
  | { kind: 'menu' }
  | { kind: 'rename' }
  | { kind: 'words' }
  | { kind: 'gremly' }
  | { kind: 'merge' }
  | { kind: 'kept'; noteId: string }
  | null;

export default function WorldDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const id = route.params.worldId;
  useAppEventOnFocus('world_view', { type: 'world', id });
  const { worlds, chapters, todos, notes, habits, habitProgress, filed, today } = useWorldsData();
  const world = worlds.find((w) => w.id === id) || null;
  const renameWorld = useGremlyStore((s) => s.renameWorld);
  const setWorldGremly = useGremlyStore((s) => s.setWorldGremly);
  const setWorldWords = useGremlyStore((s) => s.setWorldWords);
  const takeOfferedWorldWords = useGremlyStore((s) => s.takeOfferedWorldWords);
  const hideWorld = useGremlyStore((s) => s.hideWorld);
  const mergeWorlds = useGremlyStore((s) => s.mergeWorlds);
  const page = usePageActions();
  const [sheet, setSheet] = useState<WorldSheet>(null);
  // the World's own chat, over the page
  const [chatOpen, setChatOpen] = useState(false);
  const closeChat = useCallback(() => setChatOpen(false), []);

  // Merged away or gone: there is nothing to show, so go back.
  // Set while this page is the one taking the person away, so it goes back once.
  const leaving = useRef(false);
  useEffect(() => {
    if (!world && !leaving.current && nav.canGoBack()) nav.goBack();
  }, [world, nav]);

  const mine = useMemo(() => worldChapters(id, chapters, today), [id, chapters, today]);
  const loose = useMemo(
    () => worldLoose(id, { todos, notes, habits }, filed, page.justTicked),
    [id, todos, notes, habits, filed, page.justTicked],
  );
  const others = useMemo(() => worlds.filter((w) => w.id !== id && isShownWorld(w)), [worlds, id]);

  if (!world) return <SafeAreaView style={styles.screen} edges={['top']} />;

  const name = worldName(world);
  const tint = worldTint(world);
  const slug = worldGremly(world);
  const inMotion = [...mine.live, ...mine.waiting];
  const waitingIds = new Set(mine.waiting.map((c) => c.id));
  const openCount = loose.todos.filter((t) => !t.completed_at).length;
  const keptNote = sheet?.kind === 'kept' ? notes.find((n) => n.id === sheet.noteId) : null;
  const localDay = (stamp: string) => getDateService().extractLocalDate(stamp);
  const stepsOf = (cid: string) => chapterSteps(cid, todos, filed);

  async function act<T>(what: string, run: () => Promise<T>, done?: (r: T) => void) {
    setSheet(null);
    try {
      const r = await run();
      done?.(r);
    } catch (err) {
      showFailed(what, err);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID={`world-detail-${id}`}>
      <LinearGradient
        colors={[TINT[tint].wash, W.linen]}
        style={styles.tint}
        pointerEvents="none"
      />
      <PageTop
        crumb="World"
        onBack={() => nav.goBack()}
        onMenu={() => setSheet({ kind: 'menu' })}
      />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: BOX_SPACE + 60 }]}>
        <View style={styles.head}>
          <Pressable
            onPress={() => setSheet({ kind: 'rename' })}
            accessibilityRole="button"
            accessibilityLabel={`${name}. Rename it`}
          >
            <Text style={styles.name} accessibilityRole="header">
              {name}
            </Text>
          </Pressable>
          <View style={styles.ul} />
          <Pressable
            onPress={() => setSheet({ kind: 'gremly' })}
            style={({ pressed }) => [styles.gbtn, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Change its Gremly"
            testID="world-gremly"
          >
            <GremlyImage slug={slug} size={106} />
          </Pressable>
        </View>

        <View style={{ marginTop: 8 }}>
          <WordsBlock
            text={world.card_subtitle}
            yours={world.card_subtitle_source === 'user'}
            byLabel="Gremly"
            emptyText="Nothing written about it yet. Tap to write a line."
            offered={world.card_subtitle_offered}
            onRewrite={() => setSheet({ kind: 'words' })}
            onUseOffered={() =>
              act(
                'Using his words',
                () => takeOfferedWorldWords(id),
                (undo) => showSnack('Using Gremly’s words.', undo),
              )
            }
            onKeepMine={() =>
              act('Keeping yours', () => setWorldWords(id, world.card_subtitle || ''))
            }
            testID="world-words"
          />
        </View>

        <SectionHead title="In motion" count={inMotion.length || ''} />
        {inMotion.length ? (
          inMotion.map((c) => (
            <ChapterRow
              key={c.id}
              chapter={c}
              world={world}
              steps={stepsOf(c.id)}
              today={today}
              ended={waitingIds.has(c.id)}
              onOpen={() => nav.push('ChapterDetail', { chapterId: c.id })}
            />
          ))
        ) : (
          <NoneYet>No Chapter here right now. Just everyday life, which is fine.</NoneYet>
        )}

        <SectionHead title="Open" count={openCount || ''} />
        {loose.todos.map((t) => (
          <StepRow key={t.id} step={t} today={today} onToggle={page.toggleStep} />
        ))}
        <AddStepRow
          label="Add a todo"
          onAdd={async (text) => void (await page.addTodo(text, { worldId: id }))}
        />

        {loose.habits.length ? (
          <>
            <SectionHead title="Habits" />
            <HabitRows
              habits={loose.habits}
              weekOf={(h) => habitWeek(h, habitProgress, today, localDay)}
              onToggle={page.toggleHabit}
            />
          </>
        ) : null}

        {loose.kept.length ? (
          <>
            <SectionHead title="Kept here" count={plural(loose.kept.length, 'thing', 'things')} />
            <KeptStrip
              items={loose.kept}
              onOpen={(n: Note) => setSheet({ kind: 'kept', noteId: n.id })}
            />
          </>
        ) : null}

        {mine.closed.length ? (
          <>
            <SectionHead title="Looking back" />
            <View style={styles.lb}>
              {mine.closed.map((c, i) => (
                <ClosedRow
                  key={c.id}
                  chapter={c}
                  world={world}
                  showWorld={false}
                  first={i === 0}
                  onOpen={() => nav.push('ChapterDetail', { chapterId: c.id })}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <GremlyBox onPress={() => setChatOpen(true)} />
      <PageChat visible={chatOpen} kind="world" id={id} title={name} onClose={closeChat} />

      <Sheet visible={!!sheet} onClose={() => setSheet(null)} label={name}>
        {sheet?.kind === 'menu' ? (
          <View>
            <SheetTitle>{name}</SheetTitle>
            <View style={{ height: 6 }} />
            <MenuRow icon={Pencil} title="Rename it" onPress={() => setSheet({ kind: 'rename' })} />
            <MenuRow
              image={resolveMascotAsset(slug)}
              title="Change its Gremly"
              onPress={() => setSheet({ kind: 'gremly' })}
            />
            {others.length ? (
              <MenuRow
                icon={Merge}
                title="Merge with another World"
                sub="Everything moves across"
                onPress={() => setSheet({ kind: 'merge' })}
              />
            ) : null}
            <MenuRow
              icon={EyeOff}
              title="Hide this World"
              sub="Nothing is deleted. Bring it back any time"
              warn
              onPress={() =>
                act(
                  'Hiding it',
                  () => hideWorld(id),
                  (undo) => {
                    nav.goBack();
                    showSnack(`${name} is hidden. Bring it back from Worlds.`, undo);
                  },
                )
              }
              testID="world-hide"
            />
          </View>
        ) : sheet?.kind === 'rename' ? (
          <TextEdit
            title="Rename it"
            initial={name}
            onCancel={() => setSheet(null)}
            onSave={(text) =>
              act(
                'The new name',
                () => renameWorld(id, text),
                (undo) => showSnack('Renamed.', undo),
              )
            }
          />
        ) : sheet?.kind === 'words' ? (
          <TextEdit
            title="In your words"
            note="A line or two about this part of your life. Gremly will not write over it."
            initial={world.card_subtitle || ''}
            multiline
            onCancel={() => setSheet(null)}
            onSave={(text) =>
              act(
                'Your words',
                () => setWorldWords(id, text),
                (undo) => showSnack('Saved.', undo),
              )
            }
          />
        ) : sheet?.kind === 'gremly' ? (
          <GremlyPick
            forChapter={false}
            current={slug}
            onPick={(s) =>
              s &&
              act(
                'Its Gremly',
                () => setWorldGremly(id, s),
                (undo) => showSnack('New Gremly on.', undo),
              )
            }
          />
        ) : sheet?.kind === 'merge' ? (
          <WorldPick
            title={`Merge ${name} with`}
            note={`Everything in ${name} moves into the World you pick, and ${name} goes.`}
            worlds={others}
            onPick={async (keep: World) => {
              setSheet(null);
              leaving.current = true;
              try {
                const undo = await mergeWorlds(keep.id, id);
                nav.replace('WorldDetail', { worldId: keep.id });
                showSnack(`Merged into ${worldName(keep)}.`, undo);
              } catch (err) {
                leaving.current = false;
                showFailed('The merge', err);
              }
            }}
          />
        ) : sheet?.kind === 'kept' && keptNote ? (
          <KeptOpen
            note={keptNote}
            where="World"
            onRows={(rows) => page.setRows(keptNote, rows)}
            onTakeOut={() => {
              setSheet(null);
              page.takeOut({ id: keptNote.id, type: 'note' }, { worldId: id }, 'World');
            }}
          />
        ) : null}
      </Sheet>

      <UndoSnack bottom={BOX_SPACE + 30} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W.linen },
  tint: { position: 'absolute', left: 0, right: 0, top: 0, height: 300 },
  body: { paddingHorizontal: 20 },
  head: { minHeight: 104, paddingRight: 112 },
  name: {
    marginTop: 8,
    fontFamily: F.ui,
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.45,
    color: W.moss,
  },
  ul: { width: 80, height: 4, borderRadius: 2, backgroundColor: W.moss, marginTop: 12 },
  gbtn: { position: 'absolute', right: -4, top: -2, width: 106, height: 106 },
  lb: {
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    borderRadius: 18,
    overflow: 'hidden',
  },
});
