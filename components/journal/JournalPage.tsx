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
 */
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
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
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { htmlToText } from '../../lib/journal/html';
import {
  addPrompt,
  applyPage,
  isEmpty,
  pageText,
  removePrompt,
  setCardPrompt,
  toLayout,
  type JournalLayout,
  type JournalPage as Page,
} from '../../lib/journal/page';
import { pageById, type JournalPageDef } from '../../lib/journal/pages';
import { JOURNAL_COPY, countLabel, dayWords } from '../../lib/journal/words';
import type { Mood } from '../../lib/shared/moods';
import { useKeyboardLift } from '../../hooks/useKeyboardLift';
import { BRIEF } from '../brief/briefStyles';
import { JournalCardView, type JournalCardPlace } from './JournalCardView';
import {
  NO_FORMAT,
  type FormatKind,
  type FormatState,
  type JournalEditorHandle,
} from './JournalEditor';
import { JournalFormatBar } from './JournalFormatBar';
import { JournalMoodCard } from './JournalMoodCard';
import { JournalPageChips } from './JournalPageChips';
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

export type JournalPageProps = {
  /** The person's day the page is for */
  day: string;
  /** The small line over the day: "Journal · evening" */
  kicker: string;
  /** The page to start from: a new one, one kept from earlier, or a saved entry's */
  initial: Page;
  initialMoods?: Mood[];
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
    pages,
    reading = false,
    onPickPage,
    onDone,
    onClose,
    onEdit,
    onDelete,
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
      show(applyPage(await collect(), pageById(id, pages)));
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

  const close = useCallback(async () => {
    if (busy) return;
    if (reading) {
      onClose(null);
      return;
    }
    const current = await collect();
    Keyboard.dismiss();
    const changed = pageText(current) !== opened.text || moods.join(',') !== opened.moods;
    onClose(changed ? { page: current, moods } : null);
  }, [busy, collect, moods, onClose, opened, reading]);

  useImperativeHandle(ref, () => ({ close: () => void close() }), [close]);

  const toggleFormat = (kind: FormatKind) => {
    const id = active.current;
    if (id) editors.current[id]?.toggle(kind);
  };

  const toggleMood = (m: Mood) =>
    setMoods((picked) => (picked.includes(m) ? picked.filter((x) => x !== m) : [...picked, m]));

  const d = dayWords(day);
  const def = pageById(page.tpl, pages);
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
        contentContainerStyle={{ paddingBottom: reading ? insets.bottom + 32 : 132 }}
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
          <Text style={styles.date}>{d.long}</Text>
          <View style={styles.rule} />
          <Image source={JOURNAL_GREMLY} style={styles.mascot} />
        </View>

        {reading ? null : (
          <JournalPageChips pages={pages} chosen={def.id} onPick={(id) => void pick(id)} />
        )}
        {def.about && !reading ? <Text style={styles.about}>{def.about}</Text> : null}

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
          </View>
        )}

        <JournalMoodCard moods={moods} onToggle={reading ? undefined : toggleMood} />
      </ScrollView>

      {reading ? null : (
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
  noteText: { fontFamily: 'Inter-Regular', fontSize: 13, color: '#F4F1EA' },
});
