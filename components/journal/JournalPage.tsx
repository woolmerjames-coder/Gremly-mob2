/**
 * The journal page: a day's entry, written as cards.
 *
 * It has the Today header (the day in the big green type, the rule under it,
 * Gremly beside it), the pages to choose from as chips, a card for each
 * prompt and for free writing, the moods, and the format bar floating on the
 * keyboard. Looking back at a saved entry it shows the same cards to read.
 *
 * Each card's editor keeps its own words. The page collects them when it
 * needs them: before the cards change, on Done, and on close.
 *
 * Where the app can keep pages of the person's own, the page offers Make your
 * own, Keep as my page once the prompts on it are a set of their own, and
 * Edit on a page they made.
 *
 * Where it is given the journal's other entries, the date opens the calendar,
 * and a saved entry being read has the ones before and after it a tap away.
 */
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bookmark,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { todayCard, type TodayState } from '../../lib/journal/calendar';
import type { JournalEntry } from '../../lib/journal/entry';
import { htmlToText } from '../../lib/journal/html';
import {
  addPrompt,
  applyPage,
  isEmpty,
  isNewSet,
  pageText,
  promptsOf,
  removePrompt,
  setCardPrompt,
  toLayout,
  type JournalLayout,
  type JournalPage as Page,
} from '../../lib/journal/page';
import type { OwnPageForm, OwnPageGone, OwnPageSaved } from '../../lib/journal/ownPages';
import { FREEFORM, pageIn, type JournalPageDef } from '../../lib/journal/pages';
import { JOURNAL_COPY, countLabel, dayWords } from '../../lib/journal/words';
import type { Mood } from '../../lib/shared/moods';
import { useKeyboardLift } from '../../hooks/useKeyboardLift';
import { BRIEF } from '../brief/briefStyles';
import { JournalCalendar } from './JournalCalendar';
import { JournalCardView, type JournalCardPlace } from './JournalCardView';
import {
  NO_FORMAT,
  type FormatKind,
  type FormatState,
  type JournalEditorHandle,
} from './JournalEditor';
import { JournalFormatBar } from './JournalFormatBar';
import { JournalMoodCard } from './JournalMoodCard';
import { JournalOwnPageSheet } from './JournalOwnPageSheet';
import { JournalPageChips } from './JournalPageChips';
import { JournalSheet } from './JournalSheet';
import { JOURNAL_WASH, JOURNAL_WASH_LOOKING, journalStyles } from './journalStyles';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const JOURNAL_GREMLY = require('../../assets/mascot/JournalGremly.png');

export type JournalPageResult = {
  page: Page;
  /** The plain words the entry is saved with */
  text: string;
  layout: JournalLayout;
  moods: Mood[];
};

/** What was on the page when it was closed without Done */
export type JournalPageLeft = { page: Page; moods: Mood[] };

/** The rest of the journal, for the calendar behind the date */
export type JournalPageCalendar = {
  /** Every journal entry */
  entries: JournalEntry[];
  /** The person's day */
  today: string;
  /** How far along today's page is, as it is kept: saved, started, or not begun */
  todayState: TodayState;
  /** The entry that is today's page, once it is saved */
  todayEntryId?: string | null;
  /** Today's page is the one on screen */
  here: boolean;
  /** Today's page is waiting behind the entry on screen */
  back: boolean;
  /** The saved entry on screen, if it is one */
  onScreen?: string | null;
};

/** An entry to step to from the one being read: "Thu 24" */
export type JournalPageStep = { id: string; label: string };

export type JournalPageProps = {
  /** The person's day the page is for */
  day: string;
  /** The small line over the day: "Journal · evening" */
  kicker: string;
  /** The page to start from: a new one, one kept from earlier, or a saved entry's */
  initial: Page;
  initialMoods?: Mood[];
  /**
   * What the page opens with is not kept anywhere yet, such as words carried
   * in from the chat box. Leaving the page then keeps it even untouched.
   */
  unkept?: boolean;
  /** Every page there is to choose from */
  pages: JournalPageDef[];
  /** Looking back at a saved entry, which shows it to read */
  reading?: boolean;
  onPickPage?: (id: string) => void;
  onDone: (result: JournalPageResult) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Closed without Done. Given what is on the page when it was changed, and nothing otherwise. */
  onClose: (left: JournalPageLeft | null) => void;
  /** While reading: change this entry */
  onEdit?: () => void;
  /** While reading: take this entry out of the journal */
  onDelete?: () => void;
  /** The calendar behind the date. Left out where there is no journal to look back through. */
  calendar?: JournalPageCalendar;
  /** Open another entry to read. Given what is on the page, when it was changed, to keep. */
  onLookAt?: (entryId: string, left: JournalPageLeft | null) => void;
  /** Go to today's page: back to it when it is waiting, or open it. */
  onToday?: (left: JournalPageLeft | null) => void;
  /** While reading: the entries written before and after this one */
  steps?: { before: JournalPageStep | null; after: JournalPageStep | null };
  /** Keeps a page of the person's own. Given where the app can keep them. */
  onSaveOwn?: (form: OwnPageForm) => Promise<OwnPageSaved>;
  onDeleteOwn?: (id: string) => Promise<OwnPageGone>;
  fontFamily?: string;
};

const wordsOf = (page: Page): Record<string, string> =>
  Object.fromEntries(page.cards.map((c) => [c.id, htmlToText(c.html, { markers: false })]));

const countWords = (words: Record<string, string>, page: Page): number =>
  page.cards.reduce((n, c) => {
    const w = (words[c.id] ?? '').trim();
    return n + (w ? w.split(/\s+/).length : 0);
  }, 0);

export type JournalPageHandle = {
  /** Close as the button does: what was written is handed back to keep */
  close: () => void;
};

export const JournalPage = forwardRef<JournalPageHandle, JournalPageProps>(function JournalPage(
  {
    day,
    kicker,
    initial,
    initialMoods,
    unkept = false,
    pages,
    reading = false,
    onPickPage,
    onDone,
    onClose,
    onEdit,
    onDelete,
    calendar,
    onLookAt,
    onToday,
    steps,
    onSaveOwn,
    onDeleteOwn,
    fontFamily,
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const [page, setPage] = useState<Page>(initial);
  /** Each card's plain words as they are typed, for its tick and the count */
  const [words, setWords] = useState<Record<string, string>>(() => wordsOf(initial));
  const [moods, setMoods] = useState<Mood[]>(initialMoods ?? []);
  const [format, setFormat] = useState<FormatState>(NO_FORMAT);
  /** The prompt just added, whose name the keyboard opens on */
  const [naming, setNaming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /** The page of their own being made or changed, while its sheet is up */
  const [ownForm, setOwnForm] = useState<OwnPageForm | null>(null);
  const [calendarUp, setCalendarUp] = useState(false);
  /** What the page held when it opened, to tell whether it was changed */
  const [opened] = useState(() => ({
    text: pageText(initial),
    moods: (initialMoods ?? []).join(','),
  }));
  const editors = useRef<Record<string, JournalEditorHandle | null>>({});
  const active = useRef<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote(text);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  }, []);

  /** The page with every card's words as they stand in its editor now. */
  const collect = useCallback(async (): Promise<Page> => {
    const cards = await Promise.all(
      page.cards.map(async (c) => {
        const editor = editors.current[c.id];
        if (!editor) return c;
        const html = await editor.html();
        return html === c.html ? c : { ...c, html };
      }),
    );
    return { tpl: page.tpl, cards };
  }, [page]);

  /** Show a page whose cards changed: the editors of new cards start with their words. */
  const show = useCallback((next: Page) => {
    setPage(next);
    setWords(wordsOf(next));
  }, []);

  const pick = useCallback(
    async (id: string) => {
      if (busy) return;
      show(applyPage(await collect(), pageIn(pages, id)));
      setNaming(null);
      onPickPage?.(id);
    },
    [busy, collect, onPickPage, pages, show],
  );

  const add = useCallback(async () => {
    if (busy) return;
    const added = addPrompt(await collect());
    show(added.page);
    setNaming(added.id);
  }, [busy, collect, show]);

  const remove = useCallback(
    async (id: string) => {
      if (busy) return;
      show(removePrompt(await collect(), id));
    },
    [busy, collect, show],
  );

  const done = useCallback(async () => {
    if (busy) return;
    const current = await collect();
    if (isEmpty(current) && !moods.length) {
      say(JOURNAL_COPY.nothingYet);
      return;
    }
    setBusy(true);
    Keyboard.dismiss();
    const res = await onDone({
      page: current,
      text: pageText(current),
      layout: toLayout(current),
      moods,
    });
    setBusy(false);
    if (!res.ok) say(res.message || JOURNAL_COPY.notSaved);
  }, [busy, collect, moods, onDone, say]);

  /** Open the sheet for a page of their own: a new one, the prompts on the page, or one to change. */
  const openOwn = useCallback((form: OwnPageForm) => {
    Keyboard.dismiss();
    setNaming(null);
    setOwnForm(form);
  }, []);

  const keepAsOwn = useCallback(async () => {
    if (busy) return;
    openOwn({ name: '', prompts: promptsOf(await collect()) });
  }, [busy, collect, openOwn]);

  /** Keep the page, then put it on what is being written: answers stay with their questions. */
  const saveOwn = useCallback(
    async (
      form: OwnPageForm,
      reworded: Record<string, string>,
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!onSaveOwn) return { ok: false, message: JOURNAL_COPY.ownNotSaved };
      const res = await onSaveOwn(form);
      if (!res.ok) return res;
      const current = await collect();
      const cards = current.cards.map((c) => {
        if (!c.q) return c;
        // a question typed on the page matches the kept one whatever space was left round it
        const q = c.q.trim();
        // one reworded on the sheet takes its answer with it
        const now = reworded[q];
        return { ...c, q: now && res.page.prompts.includes(now) ? now : q };
      });
      show(applyPage({ tpl: current.tpl, cards }, res.page));
      onPickPage?.(res.page.id);
      Keyboard.dismiss();
      setOwnForm(null);
      say(JOURNAL_COPY.ownSaved);
      return { ok: true };
    },
    [collect, onPickPage, onSaveOwn, say, show],
  );

  const deleteOwn = useCallback(
    (id: string) => {
      if (!onDeleteOwn) return;
      Alert.alert(JOURNAL_COPY.ownDeleteAsk, JOURNAL_COPY.ownDeleteBody, [
        { text: JOURNAL_COPY.cancel, style: 'cancel' },
        {
          text: JOURNAL_COPY.deleteYes,
          style: 'destructive',
          onPress: () => {
            void onDeleteOwn(id).then((res) => {
              if (!res.ok) {
                say(res.message);
                return;
              }
              Keyboard.dismiss();
              setOwnForm(null);
              // the cards stay as they are, as prompts of their own on a freeform page
              setPage((p) =>
                p.tpl === id
                  ? {
                      tpl: FREEFORM,
                      cards: p.cards.map((c) => (c.q === null ? c : { ...c, custom: true })),
                    }
                  : p,
              );
              say(JOURNAL_COPY.ownDeleted);
            });
          },
        },
      ]);
    },
    [onDeleteOwn, say],
  );

  /** What is on the page, when it was changed since it opened: what leaving it should keep. */
  const leaving = useCallback(async (): Promise<JournalPageLeft | null> => {
    if (reading) return null;
    const current = await collect();
    Keyboard.dismiss();
    const changed = unkept || pageText(current) !== opened.text || moods.join(',') !== opened.moods;
    return changed ? { page: current, moods } : null;
  }, [collect, moods, opened, reading, unkept]);

  const close = useCallback(async () => {
    if (busy) return;
    // a sheet goes first
    if (ownForm || calendarUp) {
      setOwnForm(null);
      setCalendarUp(false);
      return;
    }
    onClose(await leaving());
  }, [busy, calendarUp, leaving, onClose, ownForm]);

  const openCalendar = useCallback(() => {
    Keyboard.dismiss();
    setNaming(null);
    setCalendarUp(true);
  }, []);

  /** Open another entry to read. What is being written here is handed over to keep. */
  const lookAt = useCallback(
    async (entryId: string) => {
      if (busy) return;
      setCalendarUp(false);
      // it is the one on screen already
      if (entryId === calendar?.onScreen) return;
      onLookAt?.(entryId, await leaving());
    },
    [busy, calendar?.onScreen, leaving, onLookAt],
  );

  const goToday = useCallback(async () => {
    if (busy) return;
    setCalendarUp(false);
    // today's page is the one on screen: carry on
    if (calendar?.here) return;
    onToday?.(await leaving());
  }, [busy, calendar?.here, leaving, onToday]);

  useImperativeHandle(ref, () => ({ close: () => void close() }), [close]);

  const toggleFormat = (kind: FormatKind) => {
    const id = active.current;
    if (id) editors.current[id]?.toggle(kind);
  };

  const toggleMood = (m: Mood) =>
    setMoods((picked) => (picked.includes(m) ? picked.filter((x) => x !== m) : [...picked, m]));

  const d = dayWords(day);
  const def = pageIn(pages, page.tpl);
  const todayIs = calendar
    ? todayCard(calendar.todayState, { here: calendar.here, back: calendar.back })
    : null;
  /** The bar for stepping between entries, under one that is being read */
  const stepping = reading && !!steps && !!onLookAt;
  const canKeepOwn = !!onSaveOwn && !reading;
  /** The prompts on the page are a set nobody has kept yet */
  const keepable = canKeepOwn && isNewSet(page, pages);
  const written = page.cards.some((c) => (words[c.id] ?? '').trim()) || moods.length > 0;
  const shown = reading ? page.cards.filter((c) => (words[c.id] ?? '').trim()) : page.cards;
  /** The prompts in order, to number them */
  const promptIds = shown.filter((c) => c.q !== null).map((c) => c.id);
  const barBottom = lift.interpolate({
    inputRange: [0, insets.bottom + 1, 2000],
    outputRange: [insets.bottom + 8, insets.bottom + 9, 2008],
  });

  return (
    <View style={styles.screen} testID="journal-page">
      <LinearGradient
        colors={[reading ? JOURNAL_WASH_LOOKING : JOURNAL_WASH, BRIEF.linen]}
        style={styles.wash}
        pointerEvents="none"
      />

      <View style={[styles.top, { marginTop: insets.top }, scrolled && styles.topScrolled]}>
        <Pressable
          style={styles.icon}
          onPress={() => void close()}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={JOURNAL_COPY.close}
          testID="journal-close"
        >
          <ChevronDown size={20} color={BRIEF.moss} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.spacer} />
        {reading ? (
          <>
            {onDelete ? (
              <Pressable
                style={styles.icon}
                onPress={onDelete}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={JOURNAL_COPY.delete}
                testID="journal-delete"
              >
                <Trash2 size={18} color={BRIEF.moss} strokeWidth={2} />
              </Pressable>
            ) : null}
            {onEdit ? (
              <Pressable
                style={styles.done}
                onPress={onEdit}
                accessibilityRole="button"
                testID="journal-edit"
              >
                <Pencil size={14} color={BRIEF.linen} strokeWidth={2.4} />
                <Text style={styles.doneText}>{JOURNAL_COPY.edit}</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Pressable
            style={[styles.done, !written && styles.doneOff]}
            onPress={() => void done()}
            disabled={busy}
            accessibilityRole="button"
            testID="journal-done"
          >
            <Text style={[styles.doneText, !written && styles.doneTextOff]}>
              {JOURNAL_COPY.done}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{
          paddingBottom: reading ? insets.bottom + (stepping ? 96 : 32) : 132,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        scrollEventThrottle={32}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 6)}
        testID="journal-scroll"
      >
        <View style={styles.hero}>
          <Text style={[styles.kicker, reading && styles.kickerLooking]}>{kicker}</Text>
          <Text style={styles.weekday} accessibilityRole="header">
            {d.weekday}
          </Text>
          {calendar ? (
            <Pressable
              style={styles.datePill}
              onPress={openCalendar}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${d.long}. ${JOURNAL_COPY.calendar}`}
              testID="journal-date"
            >
              <CalendarDays size={15} color={BRIEF.moss} strokeWidth={2} />
              <Text style={styles.dateText}>{d.long}</Text>
              <ChevronDown size={14} color={BRIEF.moss} strokeWidth={2.2} />
            </Pressable>
          ) : (
            <Text style={styles.date}>{d.long}</Text>
          )}
          <View style={styles.rule} />
          <Image source={JOURNAL_GREMLY} style={styles.mascot} />
        </View>

        {reading ? null : (
          <JournalPageChips
            pages={pages}
            chosen={def.id}
            onPick={(id) => void pick(id)}
            onMakeOwn={canKeepOwn ? () => openOwn({ name: '', prompts: [] }) : undefined}
          />
        )}
        {reading ? null : def.own && canKeepOwn ? (
          <View style={styles.aboutRow}>
            <Text style={styles.aboutOwn}>{JOURNAL_COPY.ownAbout}</Text>
            <Pressable
              onPress={() => openOwn({ id: def.id, name: def.name, prompts: def.prompts })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${JOURNAL_COPY.edit} ${def.name}`}
              testID="journal-own-edit"
            >
              <Text style={styles.aboutLink}>{JOURNAL_COPY.edit}</Text>
            </Pressable>
          </View>
        ) : def.about ? (
          <Text style={styles.about}>{def.about}</Text>
        ) : null}

        <View style={styles.cards}>
          {shown.map((c, i) => {
            const prompt = c.q !== null;
            const place: JournalCardPlace =
              shown.length === 1 && !prompt
                ? 'solo'
                : !prompt && i === shown.length - 1
                  ? 'tail'
                  : 'card';
            return (
              <JournalCardView
                key={c.id}
                card={c}
                number={prompt ? promptIds.indexOf(c.id) + 1 : null}
                place={place}
                has={!!(words[c.id] ?? '').trim()}
                editable={!reading}
                editorRef={(h) => {
                  editors.current[c.id] = h;
                }}
                onFocus={() => {
                  active.current = c.id;
                }}
                onChangeText={(text) => setWords((w) => ({ ...w, [c.id]: text }))}
                onFormat={(s) => {
                  if (active.current === c.id) setFormat(s);
                }}
                onPrompt={(q) => setPage((p) => setCardPrompt(p, c.id, q))}
                onRemove={prompt ? () => void remove(c.id) : undefined}
                namePrompt={naming === c.id}
                fontFamily={fontFamily}
                testID={`journal-card-${i}`}
              />
            );
          })}
        </View>

        {reading ? null : (
          <View style={styles.addRow}>
            <Pressable
              style={journalStyles.add}
              onPress={() => void add()}
              accessibilityRole="button"
              testID="journal-add-prompt"
            >
              <Plus size={15} color={BRIEF.moss} strokeWidth={2.3} />
              <Text style={journalStyles.addText}>{JOURNAL_COPY.addPrompt}</Text>
            </Pressable>
            {keepable ? (
              <Pressable
                style={[journalStyles.add, styles.keep]}
                onPress={() => void keepAsOwn()}
                accessibilityRole="button"
                testID="journal-keep-page"
              >
                <Bookmark size={15} color={BRIEF.moss} strokeWidth={2.1} />
                <Text style={journalStyles.addText}>{JOURNAL_COPY.keepPage}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <JournalMoodCard moods={moods} onToggle={reading ? undefined : toggleMood} />
      </ScrollView>

      {reading || ownForm ? null : (
        <Animated.View style={[styles.bar, { bottom: barBottom }]}>
          {note ? (
            <View style={styles.note} accessibilityLiveRegion="polite" testID="journal-note">
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}
          <JournalFormatBar
            state={format}
            onToggle={toggleFormat}
            count={countLabel(countWords(words, page))}
          />
        </Animated.View>
      )}

      {stepping && steps ? (
        <View style={[styles.steps, { bottom: insets.bottom + 8 }]} testID="journal-steps">
          <Pressable
            style={[styles.step, !steps.before && styles.stepOff]}
            onPress={() => steps.before && void lookAt(steps.before.id)}
            disabled={!steps.before}
            accessibilityRole="button"
            accessibilityLabel={
              steps.before
                ? `${JOURNAL_COPY.lookBefore}, ${steps.before.label}`
                : JOURNAL_COPY.lookBefore
            }
            testID="journal-step-before"
          >
            <ChevronLeft size={16} color={BRIEF.moss} strokeWidth={2.3} />
            <Text style={styles.stepText}>{steps.before?.label ?? ''}</Text>
          </Pressable>
          {calendar?.back ? (
            <Pressable
              style={styles.today}
              onPress={() => void goToday()}
              accessibilityRole="button"
              testID="journal-back-to-today"
            >
              <Text style={styles.todayText}>{JOURNAL_COPY.backToToday}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            style={[styles.step, styles.stepAfter, !steps.after && styles.stepOff]}
            onPress={() => steps.after && void lookAt(steps.after.id)}
            disabled={!steps.after}
            accessibilityRole="button"
            accessibilityLabel={
              steps.after
                ? `${JOURNAL_COPY.lookAfter}, ${steps.after.label}`
                : JOURNAL_COPY.lookAfter
            }
            testID="journal-step-after"
          >
            <Text style={styles.stepText}>{steps.after?.label ?? ''}</Text>
            <ChevronRight size={16} color={BRIEF.moss} strokeWidth={2.3} />
          </Pressable>
        </View>
      ) : null}

      {calendarUp && calendar && todayIs ? (
        <JournalSheet
          onClose={() => setCalendarUp(false)}
          closeLabel={JOURNAL_COPY.calClose}
          testID="journal-calendar-sheet"
          closeTestID="journal-calendar-close"
        >
          <ScrollView
            style={styles.calendar}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <JournalCalendar
              entries={calendar.entries}
              today={calendar.today}
              startOn={day <= calendar.today ? day : calendar.today}
              todayCard={{ ...todayIs, onPress: () => void goToday() }}
              todayEntryId={calendar.todayEntryId}
              onOpen={(e) => void lookAt(e.id)}
            />
          </ScrollView>
        </JournalSheet>
      ) : null}

      {ownForm ? (
        <>
          <JournalOwnPageSheet
            key={ownForm.id ?? 'new'}
            initial={ownForm}
            lift={lift}
            onSave={saveOwn}
            onDelete={ownForm.id ? () => deleteOwn(ownForm.id as string) : undefined}
            onClose={() => {
              Keyboard.dismiss();
              setOwnForm(null);
            }}
          />
          {note ? (
            <View
              style={[styles.note, styles.noteOverSheet, { top: insets.top + 8 }]}
              accessibilityLiveRegion="polite"
              testID="journal-note"
            >
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRIEF.linen },
  wash: { position: 'absolute', left: 0, right: 0, top: 0, height: 250 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 50,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  topScrolled: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRIEF.line },
  spacer: { flex: 1 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: BRIEF.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    backgroundColor: BRIEF.moss,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  doneOff: { backgroundColor: '#BFD8C0', shadowOpacity: 0, elevation: 0 },
  doneText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14.5, color: BRIEF.linen },
  doneTextOff: { color: 'rgba(46, 85, 64, 0.85)' },
  body: { flex: 1 },
  hero: { paddingTop: 4, paddingLeft: 20, paddingRight: 120, paddingBottom: 16, minHeight: 112 },
  kicker: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: BRIEF.periInk,
  },
  kickerLooking: { color: BRIEF.pearInk },
  weekday: {
    marginTop: 5,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: BRIEF.moss,
  },
  date: { marginTop: 4, fontFamily: 'Inter-Regular', fontSize: 15.5, color: BRIEF.muted },
  // the date as the way into the calendar
  datePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    marginLeft: -6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  dateText: { fontFamily: 'Inter-Regular', fontSize: 15.5, color: BRIEF.muted },
  rule: { width: 72, height: 4, borderRadius: 2, backgroundColor: BRIEF.moss, marginTop: 11 },
  mascot: {
    position: 'absolute',
    right: 18,
    top: 12,
    width: 90,
    height: 90,
    resizeMode: 'contain',
  },
  about: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: BRIEF.muted,
  },
  aboutRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  aboutOwn: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, color: BRIEF.muted },
  aboutLink: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    lineHeight: 19,
    color: BRIEF.moss,
    textDecorationLine: 'underline',
  },
  cards: { paddingHorizontal: 14, gap: 10 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  bar: { position: 'absolute', left: 14, right: 14 },
  note: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 51, 40, 0.94)',
  },
  // a failed delete is said over the sheet, which covers the bar
  noteOverSheet: { position: 'absolute', zIndex: 6, marginBottom: 0 },
  noteText: { fontFamily: 'Inter-Regular', fontSize: 13, color: '#F4F1EA' },
  keep: { borderStyle: 'solid', backgroundColor: 'rgba(255, 255, 255, 0.7)' },
  calendar: { flexGrow: 0, flexShrink: 1 },
  // stepping between entries, under one being read
  steps: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: BRIEF.white,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: BRIEF.mossInk,
    shadowOpacity: 0.13,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  step: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  stepAfter: { justifyContent: 'flex-end' },
  stepOff: { opacity: 0.35 },
  stepText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: BRIEF.moss,
    fontVariant: ['tabular-nums'],
  },
  today: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: BRIEF.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5, color: BRIEF.linen },
});
