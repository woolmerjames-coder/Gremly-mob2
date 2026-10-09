/**
 * A person's page (Worlds rebuild, stage 5): someone in their life, as
 * Gremly understands them. Who they are to you, the line Gremly keeps about
 * them, the days about them that matter, what you have going on with them
 * (Chapters, todos, the last thing you noted) and things to remember.
 *
 * No new tab: reached by tapping their name wherever it appears, and from
 * People on the Worlds home. Gremly writes it and you correct it, never a
 * form to fill in: Not right? at the foot, or a tap on any line Gremly wrote,
 * says what is wrong, and the pipeline puts it right everywhere. A merge
 * Gremly proposed happens on your tap, with Undo.
 *
 * Drawn in the Worlds look (look A): a dark header like a Chapter's, then the
 * parts on linen. A part with nothing in it is left out. Nothing private or
 * about health is on it (lib/people/people.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, StickyNote } from 'lucide-react-native';
import { useWorldsData } from '../../lib/worlds/useWorldsData';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Note } from '../../lib/types';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { callPersonMerge, callPersonPage } from '../../lib/cortex/CortexClient';
import {
  fetchPersonIdByName,
  fetchPersonPage,
  lastNoted,
  pageDays,
  pageRemember,
  personChapters,
  personTitle,
  personTodos,
  whoLine,
  type PersonPage,
} from '../../lib/people/people';
import { showFailed, showSnack } from '../../lib/worlds/snack';
import { F, SHADOW, W } from '../../lib/worlds/look';
import {
  chapterSteps,
  dayPlain,
  dayShort,
  daysFrom,
  hasEnded,
  isClosedChapter,
} from '../../lib/worlds/model';
import { PageTop } from '../../components/worlds/PageTop';
import { Diamond, SectionHead, TextLink } from '../../components/worlds/parts';
import { Btn } from '../../components/worlds/Sheet';
import { StepRow } from '../../components/worlds/Steps';
import { ChapterRow, ClosedRow } from '../../components/worlds/ChapterRow';
import { noteTitle } from '../../components/worlds/Kept';
import { UndoSnack } from '../../components/worlds/UndoSnack';
import { usePageActions } from '../../components/worlds/usePageActions';
import { PersonAvatar } from '../../components/people/PersonAvatar';
import {
  NotRightLink,
  NotRightSheet,
  type NotRightTarget,
} from '../../components/story/NotRightSheet';

type RouteT = RouteProp<RootStackParamList, 'PersonDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList, 'PersonDetail'>;
type Loaded =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'failed' }
  | { state: 'ready'; data: PersonPage };

/** How far off a day is, in words: today, tomorrow, in 12 days, or the date. Pure. */
export function dayWords(day: string, today: string): string {
  const n = daysFrom(today, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n < 14) return `In ${n} days, ${dayShort(day)}`;
  return dayShort(day);
}

export default function PersonScreen() {
  const route = useRoute<RouteT>();
  const nav = useNavigation<NavT>();
  const { personId, personName } = route.params ?? {};
  const { worlds, chapters, todos, notes, filed, today } = useWorldsData();
  const page = usePageActions();
  const overlay = useGlobalOverlay();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [writing, setWriting] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [notRight, setNotRight] = useState<NotRightTarget | null>(null);
  // an Undo pressed after the page has gone still puts the merge back, and leaves the page alone
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const id = personId || (personName ? await fetchPersonIdByName(personName) : null);
        const data = id ? await fetchPersonPage(id) : null;
        if (!live) return;
        if (!data) {
          setLoaded({ state: 'missing' });
          return;
        }
        setLoaded({ state: 'ready', data });
        // Gremly's words for the page, written again when what they rest on has changed
        setWriting(true);
        const r = await callPersonPage(data.person.id);
        if (!live) return;
        setWriting(false);
        if (r.ok && r.data?.page && !r.data.fresh)
          setLoaded((l) =>
            l.state === 'ready' && l.data.person.id === data.person.id
              ? { state: 'ready', data: { ...l.data, page: r.data!.page } }
              : l,
          );
        else if (!r.ok) console.warn('[People] the page could not be written:', r.error);
      } catch (err) {
        console.warn('[People] the page could not be read:', err);
        if (live) {
          setWriting(false);
          setLoaded({ state: 'failed' });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [personId, personName, attempt]);

  const data = loaded.state === 'ready' ? loaded.data : null;
  const names = useMemo(() => data?.names ?? [], [data]);
  const facts = useMemo(() => data?.facts ?? [], [data]);
  const days = useMemo(() => pageDays(data?.page ?? null, facts, today), [data, facts, today]);
  const remember = useMemo(() => pageRemember(data?.page ?? null, facts), [data, facts]);
  const theirTodos = useMemo(() => personTodos(todos, names, facts), [todos, names, facts]);
  const noted = useMemo(() => lastNoted(notes, names, facts), [notes, names, facts]);
  const theirChapters = useMemo(
    () => personChapters(chapters, data?.chapterIds ?? [], names),
    [chapters, data, names],
  );

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** Same person, or not the same: made at once, with Undo. */
  async function decide(mergeId: string, act: 'merge' | 'decline') {
    if (deciding || !data) return;
    setDeciding(true);
    try {
      const r = await callPersonMerge({ mergeId, act });
      if (!r.ok) throw new Error(r.error);
      const undo = async () => {
        const back = await callPersonMerge({ mergeId, act: 'undo' });
        if (!back.ok) throw new Error(back.error);
        if (!mounted.current) return;
        nav.setParams({ personId: data.person.id, personName: undefined });
        reload();
      };
      // the page follows the record that was kept
      if (act === 'merge' && r.data?.kept_id && r.data.kept_id !== data.person.id)
        nav.setParams({ personId: r.data.kept_id, personName: undefined });
      reload();
      showSnack(act === 'merge' ? 'Made one person.' : 'Kept as two people.', undo);
    } catch (err) {
      showFailed(act === 'merge' ? 'Making them one' : 'Keeping them apart', err);
    } finally {
      setDeciding(false);
    }
  }

  if (loaded.state !== 'ready' || !data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']} testID="person-page">
        <PageTop dark crumb="People" onBack={() => nav.goBack()} />
        <View style={[styles.scroll, styles.centre]}>
          {loaded.state === 'loading' ? (
            <ActivityIndicator color={W.moss} />
          ) : loaded.state === 'failed' ? (
            <TextLink label="The page did not load. Tap to try again." onPress={reload} />
          ) : (
            <Text style={styles.plain} testID="person-missing">
              {personName
                ? `Gremly is still getting to know ${personName}. As you mention them, their page fills in.`
                : 'Gremly does not know this person any more.'}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // who they are, when it came from something private or about health, is not shown
  const p = data.who_private ? { ...data.person, relationship: null } : data.person;
  const title = personTitle(p);
  const who = whoLine(p);
  const nothing =
    !p.words &&
    !days.length &&
    !remember.length &&
    !theirTodos.length &&
    !noted &&
    !theirChapters.length;
  const pageText = [title, who, p.words, ...days.map((d) => d.label), ...remember]
    .filter(Boolean)
    .join('. ');
  const mark = (text: string) => setNotRight({ text, kind: 'person', id: p.id });

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="person-page">
      <PageTop
        dark
        crumb="People"
        onBack={() => nav.goBack()}
        onCrumb={() => nav.navigate('People')}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <View style={styles.glow} pointerEvents="none" />
          <Text style={styles.title} accessibilityRole="header" testID="person-title">
            {title}
          </Text>
          {who ? (
            <Pressable
              onPress={() => mark(who)}
              accessibilityRole="button"
              accessibilityLabel={`${who}. Not right?`}
            >
              <Text style={styles.who} testID="person-who">
                {who}
              </Text>
            </Pressable>
          ) : null}
          <PersonAvatar person={p} size={72} style={styles.avatar} />
        </View>

        <View style={styles.body}>
          {p.words ? (
            <Pressable
              onPress={() => mark(p.words || '')}
              style={({ pressed }) => [styles.card, styles.first, pressed && { opacity: 0.94 }]}
              accessibilityRole="button"
              accessibilityHint="Say what is not right about it"
              testID="person-words"
            >
              <View style={styles.gmark}>
                <Diamond />
                <Text style={styles.gmarkText}>Gremly</Text>
              </View>
              <Text style={styles.words}>{p.words}</Text>
            </Pressable>
          ) : null}

          {data.merges.map((m) => (
            <View key={m.id} style={[styles.merge, styles.first]} testID={`person-merge-${m.id}`}>
              <View style={styles.gmark}>
                <Diamond />
                <Text style={[styles.gmarkText, { color: W.pearInk }]}>Gremly noticed</Text>
              </View>
              <Text style={styles.mergeT}>The same person as {personTitle(m.other)}?</Text>
              {whoLine(m.other) ? <Text style={styles.mergeP}>{whoLine(m.other)}</Text> : null}
              <Text style={styles.mergeP}>
                One person keeps everything Gremly knows about both. You can undo it.
              </Text>
              <View style={styles.acts}>
                <View style={{ flex: 1.4 }}>
                  <Btn
                    label="Same person"
                    disabled={deciding}
                    onPress={() => void decide(m.id, 'merge')}
                    testID="merge-yes"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn
                    kind="sec"
                    label="Not the same"
                    disabled={deciding}
                    onPress={() => void decide(m.id, 'decline')}
                    testID="merge-no"
                  />
                </View>
              </View>
            </View>
          ))}

          {nothing ? (
            <View style={[styles.card, styles.first]} testID="person-empty">
              <Text style={styles.plain}>
                {writing
                  ? 'Gremly is writing this page.'
                  : `Gremly is still getting to know ${title === 'Someone' ? 'them' : title}. As you mention them, this page fills in.`}
              </Text>
            </View>
          ) : null}

          {days.length ? (
            <>
              <SectionHead title="Dates" />
              <View style={styles.list}>
                {days.map((d, i) => (
                  <Pressable
                    key={d.id}
                    onPress={() => mark(d.label)}
                    style={[styles.row, i > 0 && styles.rowLine]}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.label}, ${dayWords(d.day, today)}`}
                    testID={`person-day-${d.id}`}
                  >
                    <Text style={styles.rowT}>{d.label}</Text>
                    <Text style={styles.rowWhen}>{dayWords(d.day, today)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {theirChapters.length || theirTodos.length || noted ? (
            <>
              <SectionHead title="Going on" />
              {theirChapters.map((c, i) => {
                const world = worlds.find((w) => w.id === c.primary_world_id) || null;
                return isClosedChapter(c) ? (
                  <ClosedRow
                    key={c.id}
                    chapter={c}
                    world={world}
                    showWorld
                    first={i === 0}
                    onOpen={() => nav.navigate('ChapterDetail', { chapterId: c.id })}
                  />
                ) : (
                  <ChapterRow
                    key={c.id}
                    chapter={c}
                    world={world}
                    steps={chapterSteps(c.id, todos, filed)}
                    today={today}
                    ended={hasEnded(c, today)}
                    onOpen={() => nav.navigate('ChapterDetail', { chapterId: c.id })}
                  />
                );
              })}
              {theirTodos.map((t) => (
                <StepRow key={t.id} step={t} today={today} onToggle={page.toggleStep} />
              ))}
              {noted ? (
                <Pressable
                  onPress={() => overlay.openEdit({ record: noted as Note })}
                  style={({ pressed }) => [styles.noted, pressed && { opacity: 0.94 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`The last thing you noted: ${noteTitle(noted)}`}
                  testID="person-noted"
                >
                  <StickyNote size={18} color={W.moss} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.notedK}>The last thing you noted</Text>
                    <Text style={styles.notedT} numberOfLines={2}>
                      {noteTitle(noted)}
                    </Text>
                  </View>
                  {noted.created_at ? (
                    <Text style={styles.rowWhen}>
                      {dayPlain(String(noted.created_at).slice(0, 10))}
                    </Text>
                  ) : null}
                  <ChevronRight size={16} color={W.faint} />
                </Pressable>
              ) : null}
            </>
          ) : null}

          {remember.length ? (
            <>
              <SectionHead title="Things to remember" />
              <View style={styles.list}>
                {remember.map((r, i) => (
                  <Pressable
                    key={`${i}-${r}`}
                    onPress={() => mark(r)}
                    style={[styles.rem, i > 0 && styles.rowLine]}
                    accessibilityRole="button"
                    accessibilityHint="Say what is not right about it"
                    testID={`person-remember-${i}`}
                  >
                    <View style={styles.dot} />
                    <Text style={styles.remT}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : writing && !nothing && facts.length ? (
            <Text style={styles.hint}>Gremly is writing the rest of this page.</Text>
          ) : null}

          <View style={styles.foot}>
            <NotRightLink
              onPress={() => mark(pageText)}
              note="Tell Gremly in your own words and it is put right everywhere."
            />
          </View>
        </View>
      </ScrollView>
      <NotRightSheet visible={!!notRight} target={notRight} onClose={() => setNotRight(null)} />
      <UndoSnack bottom={30} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W.forest },
  scroll: { flexGrow: 1, backgroundColor: W.linen, paddingBottom: 90 },
  centre: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  head: {
    backgroundColor: W.forest,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 24,
    minHeight: 130,
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
    marginRight: 96,
    fontFamily: F.ui,
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.6,
    color: W.linen,
  },
  who: {
    marginTop: 8,
    marginRight: 96,
    fontFamily: F.body,
    fontSize: 15.5,
    lineHeight: 21,
    color: W.sage,
  },
  avatar: { position: 'absolute', right: 20, bottom: 22 },
  body: { paddingHorizontal: 20, paddingTop: 4 },
  first: { marginTop: 18 },
  card: { backgroundColor: W.white, borderRadius: 20, padding: 16, gap: 4, ...SHADOW },
  gmark: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  gmarkText: {
    fontFamily: F.bodySemi,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(46,85,64,0.55)',
  },
  words: { fontFamily: F.body, fontSize: 16.5, lineHeight: 25, color: W.ink },
  plain: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: W.ink, textAlign: 'center' },
  merge: { backgroundColor: W.pearWash, borderRadius: 20, padding: 16 },
  mergeT: { fontFamily: F.ui, fontSize: 17, lineHeight: 22, color: W.forest },
  mergeP: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: W.pearInk, marginTop: 4 },
  acts: { flexDirection: 'row', gap: 10, marginTop: 14 },
  list: { backgroundColor: W.white, borderRadius: 20, paddingHorizontal: 16, ...SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: W.line },
  rowT: { flex: 1, fontFamily: F.bodySemi, fontSize: 15.5, lineHeight: 21, color: W.forest },
  rowWhen: { fontFamily: F.body, fontSize: 13.5, color: W.muted },
  noted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    backgroundColor: W.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...SHADOW,
  },
  notedK: { fontFamily: F.body, fontSize: 12.5, color: W.muted },
  notedT: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 20, color: W.forest, marginTop: 2 },
  rem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: W.sage, marginTop: 8 },
  remT: { flex: 1, fontFamily: F.body, fontSize: 15.5, lineHeight: 22, color: W.ink },
  hint: {
    fontFamily: F.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: W.muted,
    marginTop: 18,
    marginHorizontal: 2,
  },
  foot: { marginTop: 26, alignItems: 'center' },
});
