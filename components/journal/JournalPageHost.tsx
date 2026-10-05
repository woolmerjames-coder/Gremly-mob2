/**
 * Shows the journal page over whichever screen asked for it. It is on screen
 * once, at the top of the app, so every journal entry opens on the same page.
 *
 * It decides what the page starts with: the day's entry when that is already
 * written, else the page kept half written, else a new page on the one used
 * last. A check in on a goal always starts a new entry. It saves what is
 * written, unless whoever opened the page saves it themselves (the wrap up
 * does), and it keeps a page closed before Done.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Modal } from 'react-native';
import { checkInOf, entryDay, pageEntryFor, type JournalEntry } from '../../lib/journal/entry';
import { addWords, newPage, pageOfEntry, type JournalPage as Page } from '../../lib/journal/page';
import { allPages, pageById } from '../../lib/journal/pages';
import { savePage } from '../../lib/journal/save';
import {
  closeJournal,
  draftFor,
  draftKey,
  dropDraft,
  keepDraft,
  openJournal,
  pageOfDraft,
  setLastPage,
  useJournalSession,
  type JournalGoal,
  type JournalOpen,
  type JournalPart,
} from '../../lib/journal/session';
import { JOURNAL_COPY, checkInKicker, writingKicker } from '../../lib/journal/words';
import type { Mood } from '../../lib/shared/moods';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { wrapNow } from '../../lib/wrapup/day';
import { knownMoods } from '../../lib/wrapup/journal';
import { JournalPage, type JournalPageHandle } from './JournalPage';

type Start = {
  day: string;
  part: JournalPart;
  /** The saved entry being read or changed */
  entryId: string | null;
  /** The goal a new check in is for */
  goal: JournalGoal | null;
  reading: boolean;
  kicker: string;
  page: Page;
  moods: Mood[];
  /** Where a page closed before Done is kept */
  draft: string;
};

/** What the page opens with, worked out once when it is asked for. */
function startOf(request: JournalOpen, lastPage: string): Start | null {
  const notes = useGremlyStore.getState().notes as unknown as JournalEntry[];
  const pages = allPages();
  const part = request.part ?? wrapNow().part;
  const goal = request.entryId ? null : (request.goal ?? null);
  const entry = request.entryId
    ? (notes.find((n) => n.id === request.entryId) ?? null)
    : goal
      ? null
      : pageEntryFor(notes, request.day);
  // the entry asked for has gone
  if (request.entryId && !entry) return null;
  // a saved check in says which goal it is for, read or changed
  const checkIn = entry ? checkInOf(entry) : null;

  if (entry && request.reading) {
    return {
      day: entryDay(entry) || request.day,
      part,
      entryId: entry.id,
      goal: null,
      reading: true,
      kicker: checkIn ? checkInKicker(checkIn.goal_name) : JOURNAL_COPY.kickerLooking,
      page: pageOfEntry(entry, pages),
      moods: knownMoods(entry.mood),
      draft: draftKey({ day: request.day, entryId: entry.id }),
    };
  }

  const goalName = goal?.goal_name ?? checkIn?.goal_name;
  const key = draftKey({ day: request.day, entryId: entry?.id, goalId: goal?.goal_id });
  const kept = draftFor(key);
  let page: Page;
  let moods: Mood[];
  if (kept) {
    page = pageOfDraft(kept);
    moods = knownMoods(kept.moods);
  } else if (entry) {
    page = pageOfEntry(entry, pages, { toWrite: true });
    moods = knownMoods(entry.mood);
  } else {
    page = newPage(pageById(lastPage));
    moods = [];
  }
  if (request.carry) page = addWords(page, request.carry);
  return {
    day: entry ? entryDay(entry) || request.day : request.day,
    part,
    entryId: entry?.id ?? null,
    goal,
    reading: false,
    kicker: goalName
      ? checkInKicker(goalName)
      : entry
        ? JOURNAL_COPY.kickerSaved
        : writingKicker(part),
    page,
    moods,
    draft: key,
  };
}

export function JournalPageHost() {
  const request = useJournalSession((s) => s.open);
  const pageRef = useRef<JournalPageHandle>(null);
  // worked out when the page is asked for, not again as the journal changes under it
  const start = useMemo(
    () => (request ? startOf(request, useJournalSession.getState().lastPage) : null),
    [request],
  );

  // asked for an entry that has gone: there is nothing to show
  useEffect(() => {
    if (request && !start) closeJournal();
  }, [request, start]);

  if (!request || !start) return null;

  const remove = () => {
    if (!start.entryId) return;
    const id = start.entryId;
    Alert.alert(JOURNAL_COPY.deleteAsk, JOURNAL_COPY.deleteBody, [
      { text: JOURNAL_COPY.cancel, style: 'cancel' },
      {
        text: JOURNAL_COPY.deleteYes,
        style: 'destructive',
        onPress: () => {
          dropDraft(start.draft);
          closeJournal();
          void useGremlyStore
            .getState()
            .deleteNote(id)
            .catch((err: unknown) => console.warn('[Journal] could not delete the entry:', err));
        },
      },
    ]);
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => pageRef.current?.close()}
      testID="journal-page-host"
    >
      <JournalPage
        key={request.turn}
        ref={pageRef}
        day={start.day}
        kicker={start.kicker}
        initial={start.page}
        initialMoods={start.moods}
        pages={allPages()}
        reading={start.reading}
        onPickPage={setLastPage}
        onDone={async (result) => {
          const written = { text: result.text, layout: result.layout, moods: result.moods };
          const res = request.save
            ? await request.save(written)
            : await savePage({
                day: start.day,
                part: start.part,
                entryId: start.entryId,
                goal: start.goal,
                written,
              });
          if (res.ok) {
            dropDraft(start.draft);
            closeJournal();
            return { ok: true };
          }
          return res;
        }}
        onClose={(left) => {
          if (left) keepDraft(start.draft, left);
          closeJournal();
        }}
        onEdit={
          start.entryId
            ? () => openJournal({ day: start.day, entryId: start.entryId ?? undefined })
            : undefined
        }
        onDelete={start.entryId ? remove : undefined}
      />
    </Modal>
  );
}
