/**
 * Shows the journal page over whichever screen asked for it. It is on screen
 * once, at the top of the app, so every journal entry opens on the same page.
 *
 * It decides what the page starts with: the day's entry when that is already
 * written, else the page kept half written, else a new page on the one used
 * last. A check in on a goal always starts a new entry. It saves what is
 * written, unless whoever opened the page saves it themselves (the wrap up
 * does), and it keeps a page closed before Done.
 *
 * It also holds the person's own pages for the page: it brings them from
 * their account, and keeps or deletes one when the page asks.
 *
 * And it gives the page the rest of the journal: the calendar behind the
 * date, and the entries before and after one being read. Opening an older
 * entry from today's page keeps that page, and Back to today returns to it.
 *
 * Photos are chosen on the page and carried out here once the entry is saved:
 * the chosen ones are sent and the ones taken off are deleted, after the page
 * has closed, and the person is told if one could not be added.
 *
 * Starting a new entry needs the same access as making anything else in the
 * app. Someone whose trial has ended can still read and change what they
 * wrote, and is shown the way to subscribe instead of a new page. The wrap up
 * asks that itself before it opens the page.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Modal } from 'react-native';
import type { TodayState } from '../../lib/journal/calendar';
import { getDateService } from '../../lib/date/DateService';
import { eventBus } from '../../lib/events/EventBus';
import {
  checkInOf,
  entryDay,
  journalEntries,
  neighbours,
  pageEntryFor,
  type JournalEntry,
} from '../../lib/journal/entry';
import { addWords, newPage, pageOfEntry, type JournalPage as Page } from '../../lib/journal/page';
import {
  deleteOwnPage,
  ownPages,
  saveOwnPage,
  useOwnPages,
  useOwnPagesSync,
} from '../../lib/journal/ownPages';
import { FREEFORM, allPages, pageIn } from '../../lib/journal/pages';
import {
  NO_PHOTO_CHANGES,
  choosePhotos,
  hasPhotoChanges,
  photosFailedMessage,
  removePhotoFiles,
  saveEntryPhotos,
  useEntryPhotos,
  type EntryPhoto,
  type PhotoChanges,
} from '../../lib/journal/photos';
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
import { useEntryFacts } from '../../lib/journal/took';
import { JOURNAL_COPY, checkInKicker, dayWords, writingKicker } from '../../lib/journal/words';
import type { Mood } from '../../lib/shared/moods';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useSubscriptionStatus } from '../../lib/subscriptions/useSubscriptionStatus';
import { wrapNow } from '../../lib/wrapup/day';
import { knownMoods } from '../../lib/wrapup/journal';
import {
  JournalPage,
  type JournalPageCalendar,
  type JournalPageHandle,
  type JournalPageLeft,
  type JournalPageStep,
} from './JournalPage';

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
  /** What had been done to the photos: kept from earlier, or carried in from the add sheet */
  photos: PhotoChanges;
  /** Where a page closed before Done is kept */
  draft: string;
  /** The rest of the journal, for the calendar. None for a check in on a goal. */
  calendar: JournalPageCalendar | null;
  /** While reading: the entries before and after this one */
  steps: { before: JournalPageStep | null; after: JournalPageStep | null } | null;
};

/** Carry out what was done to an entry's photos, now that the entry is saved. */
function sendPhotos(noteId: string, saved: EntryPhoto[], changes: PhotoChanges): void {
  if (!hasPhotoChanges(changes)) return;
  void saveEntryPhotos(noteId, saved, changes).then(({ failed }) => {
    if (failed) Alert.alert(JOURNAL_COPY.photosNotAdded, photosFailedMessage(failed));
  });
}

/** "Thu 24", for stepping to an entry */
function step(entry: JournalEntry | null): JournalPageStep | null {
  if (!entry) return null;
  const day = entryDay(entry);
  return { id: entry.id, label: day ? dayWords(day).short.split(' ').slice(0, 2).join(' ') : '' };
}

/** The rest of the journal as the page on screen sees it. */
function calendarFor(
  notes: JournalEntry[],
  request: JournalOpen,
  on: { day: string; entryId: string | null; reading: boolean },
): JournalPageCalendar {
  const today = getDateService().ritualDay();
  const todayEntry = pageEntryFor(notes, today);
  const todayState: TodayState = todayEntry
    ? 'saved'
    : draftFor(draftKey({ day: today }))
      ? 'started'
      : 'empty';
  // today's page is on screen when it is being written: a new one, or today's saved one
  const here =
    !on.reading && on.day === today && (on.entryId === null || on.entryId === todayEntry?.id);
  return {
    entries: journalEntries(notes),
    today,
    todayState,
    todayEntryId: todayEntry?.id ?? null,
    here,
    back: !here && !!request.home,
    onScreen: on.entryId,
  };
}

/** What the page opens with, worked out once when it is asked for. */
function startOf(request: JournalOpen, lastPage: string): Start | null {
  const notes = useGremlyStore.getState().notes as unknown as JournalEntry[];
  const pages = allPages(ownPages());
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
    const near = neighbours(notes, entry.id);
    return {
      day: entryDay(entry) || request.day,
      part,
      entryId: entry.id,
      goal: null,
      reading: true,
      kicker: checkIn ? checkInKicker(checkIn.goal_name) : JOURNAL_COPY.kickerLooking,
      page: pageOfEntry(entry, pages),
      moods: knownMoods(entry.mood),
      photos: NO_PHOTO_CHANGES,
      draft: draftKey({ day: request.day, entryId: entry.id }),
      calendar: calendarFor(notes, request, {
        day: entryDay(entry) || request.day,
        entryId: entry.id,
        reading: true,
      }),
      steps: { before: step(near.before), after: step(near.after) },
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
    page = newPage(pageIn(pages, lastPage));
    moods = [];
  }
  if (request.carry) page = addWords(page, request.carry);
  const keptPhotos = kept?.photos ?? NO_PHOTO_CHANGES;
  const photos: PhotoChanges = request.carryPhotos?.length
    ? {
        added: [...new Set([...keptPhotos.added, ...request.carryPhotos])],
        removed: keptPhotos.removed,
      }
    : keptPhotos;
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
    photos,
    draft: key,
    calendar: goal
      ? null
      : calendarFor(notes, request, {
          day: entry ? entryDay(entry) || request.day : request.day,
          entryId: entry?.id ?? null,
          reading: false,
        }),
    steps: null,
  };
}

export function JournalPageHost() {
  const request = useJournalSession((s) => s.open);
  const pageRef = useRef<JournalPageHandle>(null);
  useOwnPagesSync();
  const own = useOwnPages();
  const pages = useMemo(() => allPages(own), [own]);
  // worked out when the page is asked for, not again as the journal changes under it
  const start = useMemo(
    () => (request ? startOf(request, useJournalSession.getState().lastPage) : null),
    [request],
  );

  // asked for an entry that has gone: there is nothing to show
  useEffect(() => {
    if (request && !start) closeJournal();
  }, [request, start]);

  // the photos already saved with the entry on screen
  const savedPhotos = useEntryPhotos(start?.entryId);
  // and, for one being read, what Gremly kept from it
  const took = useEntryFacts(start?.reading ? start.entryId : null);

  // a new entry, asked for by someone who can no longer make new things
  const { hasAccess, isLoading } = useSubscriptionStatus();
  const shut =
    !!request &&
    !!start &&
    !start.reading &&
    !start.entryId &&
    !request.save &&
    !isLoading &&
    !hasAccess;
  useEffect(() => {
    if (!shut) return;
    closeJournal();
    // the app answers this by showing the way to subscribe
    eventBus.emit('cortex:read_only', {});
  }, [shut]);

  if (!request || !start || shut) return null;

  /** Open another entry to read. What is being written is kept, and today's page waits behind it. */
  const lookAt = (entryId: string, left: JournalPageLeft | null) => {
    const notes = useGremlyStore.getState().notes as unknown as JournalEntry[];
    const entry = notes.find((n) => n.id === entryId);
    if (!entry) return;
    if (left) keepDraft(start.draft, left);
    openJournal({
      day: entryDay(entry) || start.day,
      entryId,
      reading: true,
      // the words carried in from the chat box are on the page already, and are kept with it
      home: start.calendar?.here ? { ...request, carry: undefined, home: undefined } : request.home,
    });
  };

  /** Back to today's page as it was asked for, or today's page afresh. */
  const toToday = (left: JournalPageLeft | null) => {
    if (left) keepDraft(start.draft, left);
    openJournal(request.home ?? { day: getDateService().ritualDay() });
  };

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
            // its photos go with it: the rows by themselves, the files here
            .then(() => removePhotoFiles(savedPhotos))
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
        // words carried in from the chat box have left it, and are only on this page
        unkept={(!!request.carry || !!request.carryPhotos?.length) && !start.reading}
        took={took}
        savedPhotos={savedPhotos}
        initialPhotoChanges={start.photos}
        onChoosePhotos={start.reading ? undefined : choosePhotos}
        pages={pages}
        reading={start.reading}
        onPickPage={setLastPage}
        onSaveOwn={saveOwnPage}
        onDeleteOwn={async (id) => {
          const res = await deleteOwnPage(id);
          // the next new page no longer opens on a page that has gone
          if (res.ok && useJournalSession.getState().lastPage === id) setLastPage(FREEFORM);
          return res;
        }}
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
            // the entry is safe: its photos follow, and the person hears if one could not
            const noteId = res.noteId ?? start.entryId;
            if (noteId) sendPhotos(noteId, savedPhotos, result.photos);
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
            ? () =>
                openJournal({
                  day: start.day,
                  entryId: start.entryId ?? undefined,
                  home: request.home,
                })
            : undefined
        }
        calendar={start.calendar ?? undefined}
        steps={start.steps ?? undefined}
        onLookAt={lookAt}
        onToday={toToday}
        onDelete={start.entryId ? remove : undefined}
      />
    </Modal>
  );
}
