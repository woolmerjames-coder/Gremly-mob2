/**
 * Changing a week already planned, by hand (Your week, Change your week).
 *
 * The board is the one the review ends on (./model.ts), with two differences.
 * There is no spread: Gremly made his when the week was planned, and what he
 * placed is saved. And nothing is given a day they did not give it: a todo
 * with no day and no day to come back is left as it is.
 *
 * Only their own moves are written, in one go and with one Undo, like the
 * review's board (./save.ts). The plan kept on the week (answers.planned)
 * follows them, so Your week reads the changed plan as the plan.
 */
import {
  changeWeekReview,
  type WeekBoardMoves,
  type WeekPlanned,
  type WeekReviewRow,
} from '../../repo/weekReviewRepo';
import { useGremlyStore } from '../../store/useGremlyStore';
import { addDays } from '../model';
import { dropUndo, patchSession, rowSaved } from '../review/session';
import { useThisWeek } from '../thisWeek';
import { boardDiff, boardOf, diffEmpty, onlyMoved, plannedDays, type Board } from './model';
import { saveBoard } from './save';

type Item = Record<string, any>;

/** The board of a week already planned, from today to its last day, with their moves so far. */
export function changeBoard(p: {
  today: string;
  row: Pick<WeekReviewRow, 'week_start' | 'read' | 'answers'>;
  daysOff: number[];
  moves: WeekBoardMoves;
  todos: Item[];
  habits: Item[];
  habitPlans: Item[];
  /** Their habits' pauses and lighter versions as saved */
  eases?: Item[];
  groups?: Map<string, string>;
}): Board {
  return boardOf({
    today: p.today,
    span: { span_start: p.row.week_start, span_end: addDays(p.row.week_start, 6) },
    daysOff: p.daysOff,
    row: {
      read: p.row.read,
      spread: null,
      // Every day a todo is on is kept: what the review said of their own
      // days (keep, freed) and where its spread put things were for the
      // spread it was planned with, and there is none here.
      answers: {
        ...p.row.answers,
        board: p.moves,
        keep: undefined,
        freed: undefined,
        planned: p.row.answers.planned
          ? { ...p.row.answers.planned, gremly: undefined }
          : undefined,
      },
    },
    todos: p.todos,
    habits: p.habits,
    habitPlans: p.habitPlans,
    eases: p.eases,
    groups: p.groups,
    assign: false,
  });
}

export interface WeekChanged {
  /** Todos put on a day, todos put off, and habit days added or taken away */
  todos: number;
  later: number;
  habitDays: number;
  /** Put everything back as it was, the plan kept on the week with it */
  undo: () => Promise<void>;
}

/** Write what is planned on the week's row, and keep every copy of the row in step. */
async function writePlanned(
  rowId: string,
  planned: (now: WeekPlanned | undefined) => WeekPlanned | undefined,
): Promise<void> {
  const written = await changeWeekReview(rowId, (r) => ({
    answers: { ...r.answers, planned: planned(r.answers.planned) },
  }));
  if (!written) throw new Error("This week's review is no longer there.");
  useThisWeek.getState().setReview(written);
  rowSaved(written);
}

/**
 * Save their moves on a week already planned: all of them, or none. Null when
 * they moved nothing. Throws when part of it could not be saved, with what
 * was written taken back.
 */
export async function saveChange(
  row: Pick<WeekReviewRow, 'id' | 'answers'>,
  board: Board,
  moves: WeekBoardMoves,
): Promise<WeekChanged | null> {
  const diff = onlyMoved(boardDiff(board), moves);
  if (diffEmpty(diff)) return null;
  // The week is changed from here on: the Undo of the board the review saved
  // would put back the week as it was before that, over this change.
  dropUndo('board');
  patchSession({ plannedBefore: null });
  const saved = await saveBoard(diff);
  if (saved.failed) {
    await saved
      .revert()
      .catch((err: unknown) =>
        console.warn('[Week] and what was written could not all be taken back:', err),
      );
    throw new Error(`${saved.failed} of the week's changes could not be saved.`);
  }
  const before = row.answers.planned;
  const open = new Set<string>(
    ((useGremlyStore.getState() as any).todos ?? [])
      .filter((t: Item) => !t.archived && !t.completed_at)
      .map((t: Item) => t.id as string),
  );
  try {
    await writePlanned(row.id, (now) => ({
      // the rest of what is kept stays: above all where Gremly put things
      // (gremly), which tells his placements from theirs when the week is
      // planned again
      ...(now ?? {}),
      todos: now?.todos ?? 0,
      later: now?.later ?? 0,
      habit_days: now?.habit_days ?? 0,
      days: plannedDays(board, now?.days, open),
    }));
  } catch (err) {
    // Their moves are saved and stand. The plan kept on the week is as it
    // was, so Your week shows each of them as moved from where it was planned.
    console.warn('[Week] the week was changed, but its kept plan could not be:', err);
  }
  return {
    todos: saved.todos,
    later: saved.later,
    habitDays: saved.habitDays,
    undo: async () => {
      await saved.revert();
      try {
        await writePlanned(row.id, () => before);
      } catch (err) {
        // everything is back where it was; only the kept plan still reads as changed
        console.warn('[Week] the change was taken back, but its kept plan could not be:', err);
      }
    },
  };
}
