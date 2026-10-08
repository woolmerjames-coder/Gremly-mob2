/**
 * A Chapter, in look A: the dark header with its name, when it is, the
 * countdown and its Gremly; its words; its next steps; what is kept on it.
 * A closed Chapter shows its memory, what was done and what was left. Closing
 * one is a small moment of its own (ClosingMoment). The box at the foot
 * opens its chat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, CircleCheck, FolderInput, Pencil, RotateCcw, Trash2 } from 'lucide-react-native';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useAppEventOnFocus } from '../../lib/appEvents';
import { getDateService } from '../../lib/date/DateService';
import { resolveMascotAsset } from '../../lib/store/mascotRegistry';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Note } from '../../lib/types';
import type { World } from '../../lib/supabase/types';
import type { Undo } from '../../lib/worlds/actions';
import { useWorldsData } from '../../lib/worlds/useWorldsData';
import { showFailed, showSnack } from '../../lib/worlds/snack';
import { F, W } from '../../lib/worlds/look';
import {
  chapterGremly,
  chapterHabits,
  chapterKept,
  chapterSteps,
  countdown,
  dateWords,
  dayOf,
  hasEnded,
  habitWeek,
  isClosedChapter,
  isDateNote,
  isDone,
  isShownWorld,
  progress,
  stepsLine,
  whenLine,
  worldGremly,
  worldName,
  worldTint,
} from '../../lib/worlds/model';
import { GremlyImage } from '../../components/worlds/GremlyFace';
import { PageTop } from '../../components/worlds/PageTop';
import { CountdownBlock } from '../../components/worlds/UpNextCard';
import { WordsBlock } from '../../components/worlds/WordsBlock';
import {
  AddStepRow,
  DoneStepRow,
  LeftStepRow,
  ShowDoneToggle,
  StepRow,
} from '../../components/worlds/Steps';
import { DateRows, HabitRows, KeptStrip, PeopleChips } from '../../components/worlds/Kept';
import { KeptOpen } from '../../components/worlds/KeptOpen';
import { Diamond, SectionHead, TextLink, plural } from '../../components/worlds/parts';
import {
  Btn,
  MenuRow,
  Sheet,
  SheetButtons,
  SheetNote,
  SheetTitle,
} from '../../components/worlds/Sheet';
import { GremlyPick } from '../../components/worlds/GremlyPick';
import { WorldPick } from '../../components/worlds/WorldPick';
import { DatesPick } from '../../components/worlds/DatesPick';
import { TextEdit } from '../../components/worlds/TextEdit';
import { ClosingMoment, type MemoryState } from '../../components/worlds/ClosingMoment';
import { GremlyBox, BOX_SPACE } from '../../components/worlds/GremlyBox';
import { PageChat } from '../../components/worlds/PageChat';
import { UndoSnack } from '../../components/worlds/UndoSnack';
import { usePageActions } from '../../components/worlds/usePageActions';

type RouteT = RouteProp<RootStackParamList, 'ChapterDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'ChapterDetail'>;
type ChapterSheet =
  | { kind: 'menu' }
  | { kind: 'rename' }
  | { kind: 'words' }
  | { kind: 'memory' }
  | { kind: 'dates' }
  | { kind: 'gremly' }
  | { kind: 'move' }
  | { kind: 'kept'; noteId: string }
  | { kind: 'delete' }
  | null;

export default function ChapterDetailScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const id = route.params.chapterId;
  useAppEventOnFocus('chapter_view', { type: 'chapter', id });
  const { worlds, chapters, todos, notes, habits, habitProgress, filed, today } = useWorldsData();
  const chapter = chapters.find((c) => c.id === id) || null;
  const world = chapter?.primary_world_id
    ? worlds.find((w) => w.id === chapter.primary_world_id) || null
    : null;
  const store = {
    renameChapter: useGremlyStore((s) => s.renameChapter),
    setChapterDates: useGremlyStore((s) => s.setChapterDates),
    moveChapter: useGremlyStore((s) => s.moveChapter),
    setChapterGremly: useGremlyStore((s) => s.setChapterGremly),
    setChapterWords: useGremlyStore((s) => s.setChapterWords),
    takeOfferedChapterWords: useGremlyStore((s) => s.takeOfferedChapterWords),
    setChapterMemory: useGremlyStore((s) => s.setChapterMemory),
    takeOfferedMemory: useGremlyStore((s) => s.takeOfferedMemory),
    closeChapter: useGremlyStore((s) => s.closeChapter),
    reopenChapter: useGremlyStore((s) => s.reopenChapter),
    deleteChapter: useGremlyStore((s) => s.deleteChapter),
    askForMemory: useGremlyStore((s) => s.askForMemory),
  };
  const page = usePageActions();
  const [sheet, setSheet] = useState<ChapterSheet>(null);
  const [showDone, setShowDone] = useState(false);
  const [closing, setClosing] = useState<{ undo: Undo; memory: MemoryState } | null>(null);
  const [asking, setAsking] = useState(false);
  // the Chapter's own chat, over the page
  const [chatOpen, setChatOpen] = useState(false);
  const closeChat = useCallback(() => setChatOpen(false), []);

  // Closed from a card in its own chat: the chat steps aside for the closing
  // moment, as when it is closed from the page (James, 8 Oct). The card has
  // already asked for the memory; it shows when it comes.
  const isClosed = !!chapter && (!!chapter.closed_at || chapter.phase === 'closed');
  const wasClosed = useRef(isClosed);
  useEffect(() => {
    if (isClosed && !wasClosed.current && chatOpen && !closing) {
      setChatOpen(false);
      setClosing({
        undo: async () => {
          await store.reopenChapter(id);
        },
        memory: chapter?.epigraph ? 'ready' : 'writing',
      });
    }
    wasClosed.current = isClosed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosed]);
  // the memory being written lands on the Chapter; when it does not come, say so
  const memoryCame = !!chapter?.epigraph;
  useEffect(() => {
    if (closing?.memory !== 'writing') return;
    if (memoryCame) {
      setClosing((c) => (c ? { ...c, memory: 'ready' } : c));
      return;
    }
    const t = setTimeout(
      () => setClosing((c) => (c && c.memory === 'writing' ? { ...c, memory: 'missing' } : c)),
      30000,
    );
    return () => clearTimeout(t);
  }, [closing?.memory, memoryCame]);

  // Deleted, or put back by Undo: there is nothing to show, so go back.
  // Set while this page is the one taking the person away, so it goes back once.
  const leaving = useRef(false);
  useEffect(() => {
    if (!chapter && !leaving.current && nav.canGoBack()) nav.goBack();
  }, [chapter, nav]);

  // While the closing moment is up, Android's back keeps the Chapter closed,
  // the same as Keep, and the swipe back is off.
  useEffect(() => {
    nav.setOptions({ gestureEnabled: !closing });
    if (!closing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setClosing(null);
      nav.goBack();
      showSnack('Kept in your story.', closing.undo);
      return true;
    });
    return () => sub.remove();
  }, [closing, nav]);

  const steps = useMemo(() => chapterSteps(id, todos, filed), [id, todos, filed]);
  const keptAll = useMemo(() => chapterKept(id, notes, filed), [id, notes, filed]);
  const chHabits = useMemo(() => chapterHabits(id, habits, filed), [id, habits, filed]);
  const otherWorlds = useMemo(
    () => worlds.filter((w) => isShownWorld(w) && w.id !== chapter?.primary_world_id),
    [worlds, chapter?.primary_world_id],
  );

  if (!chapter) return <SafeAreaView style={styles.screen} edges={['top']} />;

  const closed = isClosedChapter(chapter);
  const ended = hasEnded(chapter, today);
  const slug = chapterGremly(chapter, world);
  const tint = worldTint(world);
  const cd = closed ? null : countdown(chapter, today);
  const sl = stepsLine(steps);
  const p = progress(steps);
  const kept = keptAll.filter((n) => !isDateNote(n));
  const dates = keptAll
    .filter(isDateNote)
    .sort((a, b) => String(dayOf(a.target_date)).localeCompare(String(dayOf(b.target_date))));
  const openSteps = steps.filter((t) => !isDone(t) || page.justTicked.has(t.id));
  const doneSteps = steps.filter((t) => isDone(t) && !page.justTicked.has(t.id));
  const left = steps.filter((t) => !isDone(t)).length;
  const people = (chapter.with_you || []).map((x) => x.name).filter(Boolean);
  const keptNote = sheet?.kind === 'kept' ? notes.find((n) => n.id === sheet.noteId) : null;
  const localDay = (stamp: string) => getDateService().extractLocalDate(stamp);
  const year = (dayOf(chapter.end_date) || dayOf(chapter.start_date) || '').slice(0, 4);
  const closedWhenWords = dateWords(chapter) ? `${dateWords(chapter)} ${year}` : 'No date';
  const memoryYours = chapter.epigraph_source === 'user';

  async function act<T>(what: string, run: () => Promise<T>, done?: (r: T) => void) {
    setSheet(null);
    try {
      const r = await run();
      done?.(r);
    } catch (err) {
      showFailed(what, err);
    }
  }

  async function deleteIt() {
    setSheet(null);
    leaving.current = true;
    try {
      const undo = await store.deleteChapter(id);
      nav.goBack();
      showSnack('Chapter deleted. What was in it is kept.', undo);
    } catch (err) {
      leaving.current = false;
      showFailed('Deleting it', err);
    }
  }

  /** The World this Chapter is in: back to it when that is where they came from. */
  function openWorldPage(worldId: string) {
    const st = nav.getState();
    const prev = st?.routes?.[st.index - 1];
    const prevWorld = (prev?.params as { worldId?: string } | undefined)?.worldId;
    if (prev?.name === 'WorldDetail' && prevWorld === worldId) nav.goBack();
    else nav.push('WorldDetail', { worldId });
  }

  async function startClose() {
    setSheet(null);
    let undo: Undo;
    try {
      undo = await store.closeChapter(id);
    } catch (err) {
      showFailed('Closing it', err);
      return;
    }
    setClosing({ undo, memory: chapter?.epigraph ? 'ready' : 'writing' });
    if (chapter?.epigraph) return;
    let memory: string | null = null;
    try {
      memory = await store.askForMemory(id);
    } catch (err) {
      console.warn('[Worlds] the memory could not be written:', err);
    }
    setClosing((c) => (c ? { ...c, memory: memory ? 'ready' : 'missing' } : c));
  }

  async function askNow() {
    setAsking(true);
    try {
      const memory = await store.askForMemory(id);
      if (!memory) showSnack('Gremly could not write the memory just now. Try again later.');
    } catch (err) {
      showFailed('Asking Gremly', err);
    } finally {
      setAsking(false);
    }
  }

  const header = (
    <View style={styles.chead}>
      <View style={styles.glow} pointerEvents="none" />
      <Pressable
        onPress={closed ? undefined : () => setSheet({ kind: 'rename' })}
        disabled={closed}
        accessibilityRole={closed ? 'header' : 'button'}
        accessibilityLabel={closed ? chapter.title : `${chapter.title}. Rename it`}
      >
        <Text style={styles.title}>{chapter.title}</Text>
      </Pressable>
      {closed ? (
        <View style={styles.when}>
          <Calendar size={16} color={W.sage} />
          <Text style={styles.whenText}>{closedWhenWords}</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => setSheet({ kind: 'dates' })}
          style={({ pressed }) => [
            styles.when,
            pressed && { backgroundColor: 'rgba(249,246,241,0.1)' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${whenLine(chapter, today)}. Change the dates`}
          testID="chapter-when"
        >
          <Calendar size={16} color={W.sage} />
          <Text style={styles.whenText}>{whenLine(chapter, today)}</Text>
          <Pencil size={13} color="rgba(191,216,192,0.6)" />
        </Pressable>
      )}
      <View style={styles.countWrap}>
        {closed ? (
          <View style={{ gap: 5, marginTop: 4 }}>
            <Text style={styles.wordBig}>In your story</Text>
            <Text style={styles.countLabel}>{sl ? `Closed, ${sl}` : 'Closed'}</Text>
          </View>
        ) : cd ? (
          <CountdownBlock cd={cd} sub={sl} big={64} wordBig={30} />
        ) : steps.length ? (
          <CountdownBlock
            cd={{ kind: 'days', n: p.done, label: `of ${p.total}` }}
            sub="steps done"
            big={64}
          />
        ) : null}
      </View>
      {closed ? (
        <View style={styles.cg}>
          <GremlyImage slug={slug} size={112} />
        </View>
      ) : (
        <Pressable
          onPress={() => setSheet({ kind: 'gremly' })}
          style={({ pressed }) => [styles.cg, pressed && { transform: [{ scale: 0.95 }] }]}
          accessibilityRole="button"
          accessibilityLabel="Change its Gremly"
          testID="chapter-gremly"
        >
          <GremlyImage slug={slug} size={112} />
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID={`chapter-detail-${id}`}>
      <PageTop
        dark
        crumb={world ? worldName(world) : 'Chapter'}
        onBack={() => nav.goBack()}
        onCrumb={world ? () => openWorldPage(world.id) : undefined}
        onMenu={() => setSheet({ kind: 'menu' })}
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          backgroundColor: W.linen,
          paddingBottom: (closed ? 0 : BOX_SPACE) + 60,
        }}
      >
        {header}
        <View style={styles.body}>
          {closed ? (
            <>
              <WordsBlock
                text={chapter.epigraph}
                yours={memoryYours}
                byLabel="The memory, by Gremly"
                emptyText="No memory written yet. Tap to write one."
                offered={chapter.epigraph_offered}
                onRewrite={() => setSheet({ kind: 'memory' })}
                onUseOffered={() =>
                  act(
                    'Using his memory',
                    () => store.takeOfferedMemory(id),
                    (undo) => showSnack('Using Gremly’s memory.', undo),
                  )
                }
                onKeepMine={() =>
                  act('Keeping yours', () => store.setChapterMemory(id, chapter.epigraph || ''))
                }
                testID="chapter-memory"
              />
              {!chapter.epigraph?.trim() ? (
                <TextLink
                  label={asking ? 'Gremly is writing it' : 'Ask Gremly to write it'}
                  onPress={() => (asking ? undefined : askNow())}
                  style={{ marginTop: 10, marginLeft: 20 }}
                  testID="chapter-ask-memory"
                />
              ) : null}
              {doneSteps.length ? (
                <>
                  <SectionHead title="What you did" count={doneSteps.length} />
                  {doneSteps.map((t) => (
                    <DoneStepRow key={t.id} step={t} />
                  ))}
                </>
              ) : null}
              {left ? (
                <>
                  <SectionHead title="Left with this Chapter" count={left} />
                  <Text style={styles.hint}>
                    These stayed here when it closed, so they are out of Today. Bring one back if it
                    still needs doing.
                  </Text>
                  {steps
                    .filter((t) => !isDone(t))
                    .map((t) => (
                      <LeftStepRow
                        key={t.id}
                        step={t}
                        onBring={(s) =>
                          act(
                            'Bringing it back',
                            () =>
                              useGremlyStore
                                .getState()
                                .takeItemOut({ id: s.id, type: 'todo' }, { chapterId: id }),
                            (undo) => showSnack('Back in Today.', undo),
                          )
                        }
                      />
                    ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              {ended ? (
                <View style={styles.fin} testID="chapter-finished">
                  <View style={styles.gmark}>
                    <Diamond />
                    <Text style={styles.gmarkText}>Gremly</Text>
                  </View>
                  <Text style={styles.finT}>This looks finished</Text>
                  <Text style={styles.finP}>
                    Close it and I{'’'}ll write the memory for your story. Nothing in it is lost.
                  </Text>
                  <View style={{ marginTop: 12 }}>
                    <Btn label="Close it" onPress={startClose} testID="chapter-close-now" />
                  </View>
                </View>
              ) : null}
              <View style={{ marginTop: ended ? 16 : 0 }}>
                <WordsBlock
                  text={chapter.card_subtitle}
                  yours={chapter.card_subtitle_source === 'user'}
                  byLabel="Gremly"
                  emptyText="Nothing written about it yet. Tap to write a line."
                  offered={chapter.card_subtitle_offered}
                  onRewrite={() => setSheet({ kind: 'words' })}
                  onUseOffered={() =>
                    act(
                      'Using his words',
                      () => store.takeOfferedChapterWords(id),
                      (undo) => showSnack('Using Gremly’s words.', undo),
                    )
                  }
                  onKeepMine={() =>
                    act('Keeping yours', () =>
                      store.setChapterWords(id, chapter.card_subtitle || ''),
                    )
                  }
                  testID="chapter-words"
                />
              </View>

              <SectionHead
                title="Next steps"
                count={left ? `${left} left` : steps.length ? 'All ticked' : ''}
              />
              {openSteps.map((t) => (
                <StepRow key={t.id} step={t} today={today} onToggle={page.toggleStep} />
              ))}
              <AddStepRow
                label="Add a step"
                onAdd={async (text) => void (await page.addTodo(text, { chapterId: id }))}
              />
              {doneSteps.length ? (
                <ShowDoneToggle
                  count={doneSteps.length}
                  open={showDone}
                  onPress={() => setShowDone((v) => !v)}
                />
              ) : null}
              {showDone
                ? doneSteps.map((t) => (
                    <StepRow key={t.id} step={t} today={today} onToggle={page.toggleStep} />
                  ))
                : null}
            </>
          )}

          {kept.length ? (
            <>
              <SectionHead title="Kept here" count={plural(kept.length, 'thing', 'things')} />
              <KeptStrip
                items={kept}
                onOpen={(n: Note) => setSheet({ kind: 'kept', noteId: n.id })}
              />
            </>
          ) : null}

          {chHabits.length && !closed ? (
            <>
              <SectionHead title="Habits" />
              <HabitRows
                habits={chHabits}
                weekOf={(h) => habitWeek(h, habitProgress, today, localDay)}
                onToggle={page.toggleHabit}
              />
            </>
          ) : null}

          {dates.length && !closed ? (
            <>
              <SectionHead title="Dates" />
              <DateRows
                items={dates}
                onOpen={(n: Note) => setSheet({ kind: 'kept', noteId: n.id })}
              />
            </>
          ) : null}

          {people.length ? (
            <>
              <SectionHead title="People" />
              <PeopleChips names={people} tint={tint} />
            </>
          ) : null}
        </View>
      </ScrollView>

      {!closed && !closing ? <GremlyBox slug={slug} onPress={() => setChatOpen(true)} /> : null}
      <PageChat
        visible={chatOpen}
        kind="chapter"
        id={id}
        title={chapter.title}
        onClose={closeChat}
      />

      <Sheet visible={!!sheet} onClose={() => setSheet(null)} label={chapter.title}>
        {sheet?.kind === 'menu' ? (
          <View>
            <SheetTitle>{chapter.title}</SheetTitle>
            <View style={{ height: 6 }} />
            {closed ? (
              <MenuRow
                icon={RotateCcw}
                title="Open it again"
                sub="It goes back to In motion"
                onPress={() =>
                  act(
                    'Opening it again',
                    () => store.reopenChapter(id),
                    (undo) => showSnack('Open again. It is back in motion.', undo),
                  )
                }
                testID="chapter-reopen"
              />
            ) : (
              <>
                <MenuRow
                  icon={Pencil}
                  title="Rename it"
                  onPress={() => setSheet({ kind: 'rename' })}
                />
                <MenuRow
                  icon={Calendar}
                  title="Change the dates"
                  onPress={() => setSheet({ kind: 'dates' })}
                />
                <MenuRow
                  image={resolveMascotAsset(slug)}
                  title="Change its Gremly"
                  onPress={() => setSheet({ kind: 'gremly' })}
                />
              </>
            )}
            {otherWorlds.length ? (
              <MenuRow
                icon={FolderInput}
                title="Move to another World"
                sub={world ? `It is in ${worldName(world)}` : null}
                onPress={() => setSheet({ kind: 'move' })}
                testID="chapter-move"
              />
            ) : null}
            {!closed ? (
              <MenuRow
                icon={CircleCheck}
                title="Close this Chapter"
                sub="It becomes a memory in your story"
                onPress={startClose}
                testID="chapter-close"
              />
            ) : null}
            <MenuRow
              icon={Trash2}
              title="Delete this Chapter"
              sub="Everything in it is kept"
              warn
              onPress={() => setSheet({ kind: 'delete' })}
              testID="chapter-delete"
            />
          </View>
        ) : sheet?.kind === 'delete' ? (
          <View>
            <SheetTitle>Delete this Chapter?</SheetTitle>
            <SheetNote>
              {world
                ? `The Chapter goes. Every todo, note, list and date in it stays, filed in ${worldName(world)}.`
                : 'The Chapter goes. Every todo, note, list and date in it stays.'}
            </SheetNote>
            <SheetButtons>
              <Btn label="Keep it" kind="sec" onPress={() => setSheet(null)} />
              <Btn label="Delete it" kind="warn" onPress={deleteIt} testID="chapter-delete-yes" />
            </SheetButtons>
          </View>
        ) : sheet?.kind === 'rename' ? (
          <TextEdit
            title="Rename it"
            initial={chapter.title}
            onCancel={() => setSheet(null)}
            onSave={(text) =>
              act(
                'The new name',
                () => store.renameChapter(id, text),
                (undo) => showSnack('Renamed.', undo),
              )
            }
          />
        ) : sheet?.kind === 'words' ? (
          <TextEdit
            title="In your words"
            note="A line or two about what this is. Gremly will not write over it."
            initial={chapter.card_subtitle || ''}
            multiline
            onCancel={() => setSheet(null)}
            onSave={(text) =>
              act(
                'Your words',
                () => store.setChapterWords(id, text),
                (undo) => showSnack('Saved.', undo),
              )
            }
          />
        ) : sheet?.kind === 'memory' ? (
          <TextEdit
            title="The memory"
            note="How you want to remember it. Gremly will not write over it."
            initial={chapter.epigraph || ''}
            multiline
            onCancel={() => setSheet(null)}
            onSave={(text) =>
              act(
                'The memory',
                () => store.setChapterMemory(id, text),
                (undo) => {
                  if (closing) setClosing((c) => (c ? { ...c, memory: 'ready' } : c));
                  else showSnack('Saved.', undo);
                },
              )
            }
          />
        ) : sheet?.kind === 'dates' ? (
          <DatesPick
            startDate={chapter.start_date}
            endDate={chapter.end_date}
            today={today}
            onSave={(d) =>
              act(
                'The dates',
                () => store.setChapterDates(id, d.startDate, d.endDate),
                (undo) => showSnack('Dates changed.', undo),
              )
            }
          />
        ) : sheet?.kind === 'gremly' ? (
          <GremlyPick
            forChapter
            current={slug}
            worldSlug={worldGremly(world)}
            ownSet={!!chapter.mascot_slug}
            onPick={(s) =>
              act(
                'Its Gremly',
                () => store.setChapterGremly(id, s),
                (undo) =>
                  showSnack(s ? 'New Gremly on.' : 'It wears its World’s Gremly again.', undo),
              )
            }
          />
        ) : sheet?.kind === 'move' ? (
          <WorldPick
            title="Move it to"
            note="Everything in it moves too."
            worlds={otherWorlds}
            onPick={(to: World) =>
              act(
                'The move',
                () => store.moveChapter(id, to.id),
                (undo) => showSnack(`Moved to ${worldName(to)}.`, undo),
              )
            }
          />
        ) : sheet?.kind === 'kept' && keptNote ? (
          <KeptOpen
            note={keptNote}
            where="Chapter"
            onRows={(rows) => page.setRows(keptNote, rows)}
            onMakeStep={
              closed
                ? undefined
                : (row, rows) => {
                    const note = keptNote;
                    page.setRows(
                      note,
                      rows.filter((r) => r.id !== row.id),
                    );
                    page.addTodo(row.text, { chapterId: id }).then((made) => {
                      if (!made) {
                        page.setRows(note, rows);
                        return;
                      }
                      showSnack('Now a step. It will show in Today.', async () => {
                        await made.undo();
                        await page.setRows(note, rows);
                      });
                    });
                  }
            }
            onTakeOut={() => {
              setSheet(null);
              page.takeOut({ id: keptNote.id, type: 'note' }, { chapterId: id }, 'Chapter');
            }}
          />
        ) : null}
      </Sheet>

      {closing ? (
        <ClosingMoment
          chapter={chapter}
          world={world}
          stepsDone={p.done}
          keptCount={keptAll.length}
          memory={chapter.epigraph}
          memoryState={closing.memory}
          onRewrite={() => setSheet({ kind: 'memory' })}
          onKeep={() => {
            const undo = closing.undo;
            setClosing(null);
            nav.goBack();
            showSnack('Kept in your story.', undo);
          }}
          onNotYet={async () => {
            const undo = closing.undo;
            setClosing(null);
            try {
              await undo();
            } catch (err) {
              showFailed('Leaving it open', err);
            }
          }}
        />
      ) : null}

      <UndoSnack bottom={(closed ? 0 : BOX_SPACE) + 30} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W.forest },
  chead: {
    backgroundColor: W.forest,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    right: -70,
    top: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(191,216,192,0.10)',
  },
  title: {
    marginTop: 4,
    fontFamily: F.ui,
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.6,
    color: W.linen,
  },
  when: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6,
    marginLeft: -6,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 8,
  },
  whenText: { fontFamily: F.body, fontSize: 15, color: W.sage },
  countWrap: { marginTop: 14, marginRight: 122, minHeight: 60 },
  wordBig: { fontFamily: F.ui, fontSize: 30, lineHeight: 32, color: W.pear, letterSpacing: -0.6 },
  countLabel: { fontFamily: F.body, fontSize: 15, lineHeight: 20, color: W.onDark },
  cg: { position: 'absolute', right: 12, bottom: 16, width: 112, height: 112 },
  body: { paddingHorizontal: 20, paddingTop: 16, backgroundColor: W.linen },
  hint: {
    fontFamily: F.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: W.muted,
    marginHorizontal: 2,
    marginBottom: 4,
  },
  fin: {
    backgroundColor: W.pearWash,
    borderRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  gmark: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  gmarkText: {
    fontFamily: F.bodySemi,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(46,85,64,0.55)',
  },
  finT: { fontFamily: F.ui, fontSize: 17, lineHeight: 21, color: W.forest },
  finP: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: W.pearInk, marginTop: 4 },
});
