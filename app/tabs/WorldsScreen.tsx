/**
 * Worlds, in the look James chose (look A, "Up next"): the row of Gremlys,
 * one Chapter leading on the dark card, everything else as a quiet list, and
 * Looking back. Built from lib/worlds (the rules, the actions and the look).
 */
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAppEventOnFocus } from '../../lib/appEvents';
import { useStory } from '../../lib/story/useStory';
import { getDateService } from '../../lib/date/DateService';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Todo } from '../../lib/types';
import type { World } from '../../lib/supabase/types';
import { useWorldsData } from '../../lib/worlds/useWorldsData';
import { showFailed, showSnack } from '../../lib/worlds/snack';
import { F, TAB_BAR_SPACE, W } from '../../lib/worlds/look';
import {
  chapterSteps,
  closedChapters,
  dayPlain,
  hiddenWorlds,
  isHiddenWorld,
  leadChapter,
  liveChapters,
  shownWorlds,
  waitingChapters,
  worldName,
} from '../../lib/worlds/model';
import { WorldsStrip } from '../../components/worlds/WorldsStrip';
import { UpNextCard, stepTitle } from '../../components/worlds/UpNextCard';
import { ChapterRow, ClosedRow } from '../../components/worlds/ChapterRow';
import { NoneYet, SectionHead, TextLink, plural } from '../../components/worlds/parts';
import { Btn, Sheet } from '../../components/worlds/Sheet';
import { StartSomething } from '../../components/worlds/StartSomething';
import { WorldPick } from '../../components/worlds/WorldPick';
import { UndoSnack } from '../../components/worlds/UndoSnack';
import { lightTap } from '../../components/worlds/usePageActions';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type HomeSheet = { kind: 'start'; asWorld?: boolean } | { kind: 'hidden' } | null;

export default function WorldsScreen() {
  useAppEventOnFocus('world_view', { type: 'worlds_tab' });
  const nav = useNavigation<Nav>();
  const { worlds, chapters, todos, filed, today } = useWorldsData();
  const refreshWorldsGraph = useGremlyStore((s) => s.refreshWorldsGraph);
  const completeTodo = useGremlyStore((s) => s.completeTodo);
  const uncompleteTodo = useGremlyStore((s) => s.uncompleteTodo);
  const makeChapter = useGremlyStore((s) => s.makeChapter);
  const makeWorld = useGremlyStore((s) => s.makeWorld);
  const unhideWorld = useGremlyStore((s) => s.unhideWorld);
  const { data: story } = useStory();
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<HomeSheet>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshWorldsGraph();
    } finally {
      setRefreshing(false);
    }
  }, [refreshWorldsGraph]);

  const shown = useMemo(() => shownWorlds(worlds), [worlds]);
  const hidden = useMemo(() => hiddenWorlds(worlds), [worlds]);
  const worldById = useMemo(() => new Map(worlds.map((w) => [w.id, w])), [worlds]);
  // A hidden World's Chapters are hidden with it.
  const mine = useMemo(
    () =>
      chapters.filter((c) => {
        const w = c.primary_world_id ? worldById.get(c.primary_world_id) : null;
        return !w || !isHiddenWorld(w);
      }),
    [chapters, worldById],
  );
  const lead = useMemo(() => leadChapter(mine, today), [mine, today]);
  const also = useMemo(
    () => liveChapters(mine, today).filter((c) => c.id !== lead?.id),
    [mine, today, lead],
  );
  const waiting = useMemo(() => waitingChapters(mine, today), [mine, today]);
  const closed = useMemo(() => closedChapters(mine), [mine]);
  const worldOf = (id: string | null) => (id ? worldById.get(id) || null : null);
  const stepsOf = (id: string) => chapterSteps(id, todos, filed);

  const openChapter = (id: string) => nav.navigate('ChapterDetail', { chapterId: id });
  const openWorld = (w: World) => nav.navigate('WorldDetail', { worldId: w.id });

  async function tick(step: Todo) {
    lightTap();
    try {
      await completeTodo(step.id);
      showSnack(`Ticked off: ${stepTitle(step)}`, () => uncompleteTodo(step.id));
    } catch (err) {
      showFailed('Ticking that off', err);
    }
  }

  async function bringBack(w: World) {
    setSheet(null);
    try {
      const undo = await unhideWorld(w.id);
      showSnack(`${worldName(w)} is back.`, undo);
    } catch (err) {
      showFailed('Bringing it back', err);
    }
  }

  const firstDay = !shown.length && !chapters.length;
  const updated = story.header.writtenAt
    ? getDateService().extractLocalDate(story.header.writtenAt)
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="worlds-screen">
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={W.moss} />
        }
      >
        <View style={styles.top}>
          <Text style={styles.h} accessibilityRole="header">
            Worlds
          </Text>
          <Pressable
            onPress={() => setSheet({ kind: 'start' })}
            style={({ pressed }) => [styles.plus, pressed && { transform: [{ scale: 0.94 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Start something new"
            testID="worlds-plus"
          >
            <Plus size={22} color={W.linen} />
          </Pressable>
        </View>

        {firstDay ? (
          <View style={styles.empty} testID="worlds-first-day">
            <Image
              source={resolveMascotAsset('gremly-mascot')}
              style={{ width: 140, height: 140 }}
              resizeMode="contain"
            />
            <Text style={styles.emptyH}>Nothing here yet, and that is fine</Text>
            <Text style={styles.emptyP}>
              Drop a few things and I{'’'}ll start sorting them. Or start something yourself.
            </Text>
            <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
              <Btn
                label="Start something yourself"
                icon={Plus}
                onPress={() => setSheet({ kind: 'start' })}
              />
            </View>
          </View>
        ) : (
          <>
            <WorldsStrip
              worlds={shown}
              onOpen={openWorld}
              onNew={() => setSheet({ kind: 'start', asWorld: true })}
            />

            {lead ? (
              <UpNextCard
                chapter={lead}
                world={worldOf(lead.primary_world_id)}
                steps={stepsOf(lead.id)}
                today={today}
                onOpen={() => openChapter(lead.id)}
                onTick={tick}
              />
            ) : (
              <NoneYet>
                Nothing in motion yet. A trip, a goal or a project shows up here the moment you
                start one.
              </NoneYet>
            )}

            {also.length ? (
              <>
                <SectionHead title="Also in motion" />
                {also.map((c) => (
                  <ChapterRow
                    key={c.id}
                    chapter={c}
                    world={worldOf(c.primary_world_id)}
                    steps={stepsOf(c.id)}
                    today={today}
                    ended={false}
                    onOpen={() => openChapter(c.id)}
                  />
                ))}
              </>
            ) : null}

            {waiting.length ? (
              <>
                <SectionHead title="Waiting for you" />
                {waiting.map((c) => (
                  <ChapterRow
                    key={c.id}
                    chapter={c}
                    world={worldOf(c.primary_world_id)}
                    steps={stepsOf(c.id)}
                    today={today}
                    ended
                    onOpen={() => openChapter(c.id)}
                  />
                ))}
              </>
            ) : null}

            {hidden.length ? (
              <TextLink
                label={`${plural(hidden.length, 'hidden World', 'hidden Worlds')}. Bring ${hidden.length === 1 ? 'it' : 'them'} back`}
                onPress={() =>
                  hidden.length === 1 ? bringBack(hidden[0]) : setSheet({ kind: 'hidden' })
                }
                style={{ marginTop: 14, marginLeft: 2 }}
                testID="worlds-hidden"
              />
            ) : null}

            <SectionHead title="Looking back" />
            <Pressable
              onPress={() => nav.navigate('YourStory')}
              style={({ pressed }) => [styles.story, pressed && { opacity: 0.94 }]}
              accessibilityRole="button"
              accessibilityLabel="Open your story"
              testID="worlds-story"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.storyK}>Your story</Text>
                <Text style={styles.storyB}>
                  Everything Gremly has understood about you, so far.
                </Text>
                {updated ? <Text style={styles.storyS}>Updated {dayPlain(updated)}</Text> : null}
              </View>
              <ChevronRight size={18} color={W.linen} />
            </Pressable>
            {closed.length ? (
              <View style={styles.lb}>
                {closed.map((c, i) => (
                  <ClosedRow
                    key={c.id}
                    chapter={c}
                    world={worldOf(c.primary_world_id)}
                    showWorld
                    first={i === 0}
                    onOpen={() => openChapter(c.id)}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        label={sheet?.kind === 'hidden' ? 'Bring a World back' : 'Start something new'}
      >
        {sheet?.kind === 'start' ? (
          <StartSomething
            worlds={shown}
            today={today}
            asWorld={sheet.asWorld}
            onStartChapter={async (input) => {
              setSheet(null);
              try {
                const { chapter, undo } = await makeChapter(input);
                openChapter(chapter.id);
                showSnack('Started. It is in motion now.', undo);
              } catch (err) {
                showFailed('Starting it', err);
              }
            }}
            onMakeWorld={async (input) => {
              setSheet(null);
              try {
                const { world, undo } = await makeWorld(input);
                openWorld(world);
                showSnack(`${worldName(world)} is one of your Worlds now.`, undo);
              } catch (err) {
                showFailed('Making the World', err);
              }
            }}
          />
        ) : sheet?.kind === 'hidden' ? (
          <WorldPick
            title="Bring a World back"
            note="It comes back with everything that was in it."
            worlds={hidden}
            onPick={bringBack}
          />
        ) : null}
      </Sheet>

      <UndoSnack bottom={72 + 12} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W.linen },
  body: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: TAB_BAR_SPACE + 40 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 8,
  },
  h: { fontFamily: F.ui, fontSize: 30, letterSpacing: -0.45, color: W.moss },
  plus: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: W.moss,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2E5540',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  empty: { alignItems: 'center', paddingTop: 10, paddingHorizontal: 8 },
  emptyH: {
    fontFamily: F.ui,
    fontSize: 22,
    lineHeight: 26,
    color: W.forest,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyP: {
    fontFamily: F.body,
    fontSize: 15,
    lineHeight: 22,
    color: W.muted,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  story: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: W.forest,
    borderRadius: 20,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 16,
    marginBottom: 10,
  },
  storyK: {
    fontFamily: F.ui,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(249,246,241,0.66)',
  },
  storyB: { fontFamily: F.ui, fontSize: 17, lineHeight: 22, color: W.linen, marginTop: 4 },
  storyS: { fontFamily: F.body, fontSize: 13, color: 'rgba(249,246,241,0.66)', marginTop: 4 },
  lb: {
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    borderRadius: 18,
    overflow: 'hidden',
  },
});
