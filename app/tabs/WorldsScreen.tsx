/**
 * Worlds, in the look James chose (look A, "Up next"): the row of Gremlys,
 * one Chapter leading on the dark card, everything else as a quiet list, and
 * Looking back. Built from lib/worlds (the rules, the actions and the look).
 * Gremly's one question waits above the box, and after time away the welcome
 * back comes as a card (stage 3, lib/worlds/questions.ts).
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
import { Btn, MenuRow, Sheet, SheetTitle } from '../../components/worlds/Sheet';
import { StartSomething } from '../../components/worlds/StartSomething';
import { WorldPick } from '../../components/worlds/WorldPick';
import { UndoSnack } from '../../components/worlds/UndoSnack';
import { BOX_SPACE, CHIP_SPACE, GremlyBox } from '../../components/worlds/GremlyBox';
import { PageChat } from '../../components/worlds/PageChat';
import { lightTap } from '../../components/worlds/usePageActions';
import { AskCard } from '../../components/worlds/AskCard';
import {
  PICK_WORDS,
  WelcomeBack,
  guessPick,
  picksFor,
  type AwayPick,
} from '../../components/worlds/WelcomeBack';
import { useWorldsQuestions } from '../../lib/worlds/useWorldsQuestions';
import {
  askWords,
  closeIt,
  moveIt,
  notNow,
  proposedWorld,
  startIt,
  stillGoing,
  tellGremly,
  type AskAct,
  type WorldsQuestion,
} from '../../lib/worlds/questions';
import type { Undo } from '../../lib/worlds/actions';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type HomeSheet =
  | { kind: 'start'; asWorld?: boolean }
  | { kind: 'hidden' }
  | { kind: 'ask'; q: WorldsQuestion }
  | { kind: 'away'; q: WorldsQuestion }
  | null;

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
  // the box's chat, over Worlds: fresh each time it opens
  const [chatOpen, setChatOpen] = useState(false);
  const closeChat = useCallback(() => setChatOpen(false), []);
  // A World just made is scrolled into view along the top.
  const [madeWorld, setMadeWorld] = useState<string | null>(null);
  // Gremly's questions: the one above the box, and the welcome back
  const { ask, away, drop, restore } = useWorldsQuestions(today);
  const [awayPicks, setAwayPicks] = useState<Record<string, AwayPick>>({});
  const [awayLater, setAwayLater] = useState(false);
  const [answering, setAnswering] = useState(false);

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

  const titleOf = (id: string) => chapters.find((c) => c.id === id)?.title?.trim() || 'It';

  /** A tap on a question's own button: made with Undo, and the question gone everywhere. */
  async function answer(q: WorldsQuestion, act: AskAct) {
    setSheet(null);
    setAnswering(true);
    drop([q.id]);
    const name = q.proposal.type === 'start' ? q.proposal.title : titleOf(q.proposal.chapter_id);
    try {
      let undo: Undo;
      let line: string;
      if (act === 'start') {
        const made = await startIt(q, { worldId: proposedWorld(q, worlds) });
        undo = made.undo;
        line = `${made.chapter.title} is in motion now.`;
      } else if (act === 'no') {
        undo = await notNow(q);
        line = 'Left as it is. Gremly will not suggest it again.';
      } else if (act === 'close') {
        undo = await closeIt(q);
        line = `${name} is closed and part of your story.`;
      } else if (act === 'move') {
        undo = await moveIt(q);
        line = `${name} has its new dates.`;
      } else {
        undo = await stillGoing(q, today);
        line = `${name} stays open.`;
      }
      showSnack(line, async () => {
        await undo();
        restore([q]);
      });
    } catch (err) {
      restore([q]);
      showFailed('That answer', err);
    } finally {
      setAnswering(false);
    }
  }

  /** Their own words: the pipeline reads them and acts, as it does in the brief. */
  async function tell(q: WorldsQuestion, said: string) {
    setSheet(null);
    drop([q.id]);
    if (await tellGremly(q, said)) showSnack('Sent to Gremly. He will take it from there.');
    else {
      restore([q]);
      showSnack('That did not send. Check your connection and try again.');
    }
  }

  /** The welcome back: each Chapter as picked, all at once, with one Undo. */
  async function acceptAway() {
    const list = away;
    setAnswering(true);
    const done: Undo[] = [];
    try {
      for (const q of list) {
        const pick = awayPicks[q.id] ?? guessPick(q);
        done.push(
          pick === 'close'
            ? await closeIt(q)
            : pick === 'move'
              ? await moveIt(q)
              : await stillGoing(q, today),
        );
      }
      drop(list.map((q) => q.id));
      showSnack('Done. Each one is as you picked, and nothing in them is lost.', async () => {
        for (const u of [...done].reverse()) await u();
        restore(list);
      });
    } catch (err) {
      for (const u of [...done].reverse()) await u().catch(() => undefined);
      showFailed('Settling what passed', err);
    } finally {
      setAnswering(false);
    }
  }

  const awayOpen = away.length > 0 && !awayLater;
  const chip =
    away.length && awayLater
      ? { label: 'Tidy what passed?', onPress: () => setAwayLater(false) }
      : ask
        ? { label: askWords(ask, chapters).chip, onPress: () => setSheet({ kind: 'ask', q: ask }) }
        : null;

  const firstDay = !shown.length && !chapters.length && !hidden.length;
  const updated = story.header.writtenAt
    ? getDateService().extractLocalDate(story.header.writtenAt)
    : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="worlds-screen">
      <ScrollView
        contentContainerStyle={[
          styles.body,
          chip ? { paddingBottom: BODY_END + CHIP_SPACE } : null,
        ]}
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
              revealId={madeWorld}
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

            {awayOpen ? (
              <WelcomeBack
                questions={away}
                chapters={chapters}
                picks={awayPicks}
                today={today}
                busy={answering}
                onPick={(q) => setSheet({ kind: 'away', q })}
                onAcceptAll={() => void acceptAway()}
                onLater={() => setAwayLater(true)}
              />
            ) : null}

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
        label={
          sheet?.kind === 'hidden'
            ? 'Bring a World back'
            : sheet?.kind === 'ask' || sheet?.kind === 'away'
              ? 'Gremly asks'
              : 'Start something new'
        }
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
                setMadeWorld(world.id);
                showSnack('World made.', undo);
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
        ) : sheet?.kind === 'ask' ? (
          <AskCard
            question={sheet.q}
            busy={answering}
            onAct={(act) => void answer(sheet.q, act)}
            onTell={(said) => void tell(sheet.q, said)}
          />
        ) : sheet?.kind === 'away' ? (
          <View>
            <SheetTitle>
              {sheet.q.proposal.type === 'start' ? '' : titleOf(sheet.q.proposal.chapter_id)}
            </SheetTitle>
            <View style={{ height: 8 }} />
            {picksFor(sheet.q).map((p) => (
              <MenuRow
                key={p}
                title={PICK_WORDS[p]}
                sub={
                  p === 'close'
                    ? 'Its memory is written for your story'
                    : p === 'move'
                      ? 'To the days Gremly found'
                      : 'It stays open'
                }
                selected={(awayPicks[sheet.q.id] ?? guessPick(sheet.q)) === p}
                onPress={() => {
                  setAwayPicks((m) => ({ ...m, [sheet.q.id]: p }));
                  setSheet(null);
                }}
                testID={`away-to-${p}`}
              />
            ))}
          </View>
        ) : null}
      </Sheet>

      <GremlyBox slug="gremly-mascot" onPress={() => setChatOpen(true)} above={72} chip={chip} />
      <PageChat visible={chatOpen} kind="home" onClose={closeChat} />

      <UndoSnack bottom={72 + BOX_SPACE + (chip ? CHIP_SPACE : 0) + 12} />
    </SafeAreaView>
  );
}

const BODY_END = TAB_BAR_SPACE + BOX_SPACE + 24;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W.linen },
  body: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: BODY_END },
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
