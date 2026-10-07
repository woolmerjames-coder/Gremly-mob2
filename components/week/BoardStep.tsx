/**
 * The board's place in today's thread, and its sheet, each fed from the
 * review in hand (lib/week/board/now.ts): BoardStep is the card the review's
 * last step puts in the thread, and WeekBoardSheet is the board itself, which
 * the screen mounts once so it stays open whatever the thread is doing.
 *
 * The step's card stands for four things in turn (lib/week/board/model.ts
 * boardStage): Gremly's question about the days they gave their todos
 * themselves, when there are many; then each day their kept todos overfill,
 * one at a time, with the moves Gremly suggests for it; then each todo that
 * matters most this week and is on no day, with a day or a split to put it
 * on one; then the board. What they chose along the way stays above it, as
 * their own answers.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WeekCardMeta } from '../../lib/brief/types';
import { getDateService } from '../../lib/date/DateService';
import {
  boardStage,
  keepLoad,
  placedBy,
  reliefFor,
  unfitted,
  type BoardStage,
} from '../../lib/week/board/model';
import { useBoard, useRelief, useSpreadStale } from '../../lib/week/board/now';
import type { WeekReview } from '../../lib/week/useWeekReview';
import { useWeekSession } from '../../lib/week/review/session';
import { stepOf } from '../../lib/week/review/state';
import {
  WEEK_COPY,
  boardIntro,
  changeDayTitle,
  fitDayButton,
  fitPartsLine,
  fitSplitButton,
  fittedText,
  intentionQuote,
  keepQuestion,
  keptText,
  overfullLine,
  relievedText,
  shortDay,
  spanLabel,
  unfittedLine,
} from '../../lib/week/review/words';
import { BoardCard } from './BoardCard';
import { FitCard, KeepPick, KeepQuestion, OverfullCard } from './KeepCards';
import { WeekBoard } from './WeekBoard';
import { weekStyles } from './weekStyles';

export function BoardStep({
  meta,
  live,
  disabled,
  review,
}: {
  meta: WeekCardMeta;
  /** The review is on this step, so the board can be opened from here */
  live: boolean;
  disabled?: boolean;
  review: WeekReview;
}) {
  const board = useBoard();
  const relief = useRelief();
  const stale = useSpreadStale();
  const fitting = useWeekSession((s) => s.fitting);
  const failed = useWeekSession((s) => s.spreadFailed);
  const opened = useWeekSession((s) => !!s.moves.opened);
  const spread = useWeekSession((s) => !!s.row?.spread);
  const answers = useWeekSession((s) => s.row?.answers);
  const asking = useWeekSession((s) => s.asking);
  const picking = useWeekSession((s) => s.picking);
  const freedDraft = useWeekSession((s) => s.freedDraft);
  const undoable = useWeekSession((s) => s.undoable);
  const today = getDateService().ritualDay();

  // Gremly's spread for these answers is on the board: only then is it known
  // what he left off the days.
  const ready = !failed && !fitting && spread && !stale;
  const at: BoardStage =
    live && board ? boardStage(board, answers, { asking, picking, ready }) : { stage: 'board' };
  // what they chose so far, as their own answers above the card
  const trail: string[] = [];
  if (board && answers) {
    if (answers.keep && at.stage !== 'keep' && at.stage !== 'pick' && board.theirs.length) {
      trail.push(keptText(answers.keep));
    }
    for (const d of board.days) {
      const how = answers.relieved?.[d.day];
      if (how) trail.push(relievedText(d.day, how));
    }
  }
  const canChange = live && !!answers?.keep && at.stage !== 'keep' && at.stage !== 'pick';
  // what they chose for each todo that mattered most and was on no day, in
  // the order they chose; the last can be taken back
  const fitted = Object.entries(answers?.fitted ?? {}).sort((a, b) => a[1].order - b[1].order);
  if (board) for (const [, f] of fitted) trail.push(fittedText(f));
  const lastFit = fitted[fitted.length - 1];
  const canUnfit =
    live &&
    !!lastFit &&
    at.stage !== 'keep' &&
    at.stage !== 'pick' &&
    // a split was written when it was chosen: it is taken back only while its Undo is held
    (lastFit[1].how !== 'split' || !!undoable[`fit:${lastFit[0]}`]);

  let body: React.ReactNode;
  if (board && at.stage === 'keep') {
    const load = keepLoad(board);
    body = (
      <KeepQuestion
        line={keepQuestion(
          board.theirs.length,
          load.filter((d) => d.over > 0).map((d) => d.day),
        )}
        days={load}
        chosen={answers?.keep}
        disabled={disabled}
        onKeep={(choice) => void review.board.keep(choice)}
      />
    );
  } else if (board && at.stage === 'pick') {
    body = (
      <KeepPick
        days={keepLoad(board, freedDraft)}
        todos={board.theirs}
        freed={freedDraft}
        disabled={disabled}
        onToggle={review.board.togglePin}
        onDone={() => void review.board.keepDone()}
      />
    );
  } else if (board && at.stage === 'overfull') {
    const day = at.day;
    const offered = reliefFor(board, relief, day);
    const over = board.days.find((d) => d.day === day)?.over ?? 0;
    // The suggestions come with the spread. Until one made for these answers
    // is in, they are on their way; one that came back without any has none.
    // A day they filled by hand since the spread was made has none yet either,
    // and the week is being spread again around it.
    const waiting = !offered && !failed && (fitting || !spread || stale);
    body = (
      <OverfullCard
        day={day}
        line={overfullLine(day, over, waiting ? 0 : (offered?.moves.length ?? 0))}
        today={today}
        fitting={waiting}
        moves={offered?.moves ?? []}
        note={offered?.note ?? ''}
        still={offered?.still ?? 0}
        // He looked and offered nothing: he would leave the day as it is. Any
        // other card without moves is one whose moves could not be worked out.
        none={
          relief && !relief.failed && offered && offered.asked === 0
            ? WEEK_COPY.overfullStuck
            : WEEK_COPY.overfullNone
        }
        disabled={disabled}
        onTake={() => void review.board.relieve(day, 'moved')}
        onChange={() => void review.board.relieve(day, 'changed')}
        onLeave={() => void review.board.relieve(day, 'left')}
      />
    );
  } else if (board && at.stage === 'unfitted') {
    const offer = unfitted(board, answers).find((u) => u.todo.id === at.id);
    const id = at.id;
    body = offer ? (
      <FitCard
        id={id}
        line={unfittedLine(offer.todo.title, offer.todo.minutes, offer.fits)}
        dayLabel={offer.day ? fitDayButton(offer.day) : null}
        splitLabel={offer.parts ? fitSplitButton(offer.parts.length) : null}
        partsLine={offer.parts ? fitPartsLine(offer.parts) : ''}
        disabled={disabled}
        onDay={() => void review.board.fit(id, 'day')}
        onSplit={() => void review.board.fit(id, 'split')}
        onOpen={review.board.open}
        onLeave={() => void review.board.fit(id, 'left')}
      />
    ) : null;
  } else {
    // Until Gremly's spread for these answers is in, the card says he is
    // fitting the week: one made for other answers is about to be made again.
    const state = !live
      ? 'ready'
      : failed
        ? 'failed'
        : fitting || !spread || stale
          ? 'fitting'
          : 'ready';
    const t = board?.totals;
    const intro =
      meta.intro ??
      (state === 'failed'
        ? WEEK_COPY.spreadFailed
        : state === 'ready' && board && t
          ? boardIntro({
              all: t.all,
              room: t.room,
              habits: t.habits,
              ...placedBy(board),
              later: board.later.length,
            })
          : null);
    body = (
      <BoardCard
        intro={intro}
        state={state}
        days={(board?.days ?? []).map((d) => ({
          day: d.day,
          short: shortDay(d.day),
          count: d.todos.length,
          fraction:
            d.todos.length || d.habits.length
              ? d.minutes > 0
                ? (d.habitMinutes + d.todoMinutes) / d.minutes
                : 1
              : 0,
          tone: d.left < 0 ? 'over' : d.busy ? 'busy' : 'ok',
        }))}
        cta={opened ? WEEK_COPY.openWeek : WEEK_COPY.planMyWeek}
        live={live}
        disabled={disabled}
        onOpen={review.board.open}
        onRetry={review.board.retry}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {trail.length ? (
        <View style={styles.trail} testID="week-board-trail">
          {trail.map((text, i) => (
            <View key={i} style={[weekStyles.bubble, styles.said]}>
              <Text style={weekStyles.bubbleText}>{text}</Text>
            </View>
          ))}
          {canChange ? (
            <TouchableOpacity
              style={styles.change}
              onPress={review.board.askKeep}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-keep-change"
            >
              <Text style={weekStyles.linkText}>{WEEK_COPY.change}</Text>
            </TouchableOpacity>
          ) : null}
          {canUnfit ? (
            <TouchableOpacity
              style={styles.change}
              onPress={() => void review.board.unfit()}
              disabled={disabled}
              accessibilityRole="button"
              testID="week-fit-undo"
            >
              <Text style={weekStyles.linkText}>{WEEK_COPY.fitUndo}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {body}
    </View>
  );
}

/** The board of the review in hand, as a sheet over the thread. */
export function WeekBoardSheet({ review }: { review: WeekReview }) {
  const board = useBoard();
  const stale = useSpreadStale();
  const open = useWeekSession((s) => s.boardOpen);
  const openOn = useWeekSession((s) => s.boardDay);
  const relieving = useWeekSession((s) => s.relieving);
  const fitting = useWeekSession((s) => s.fitting);
  const failed = useWeekSession((s) => s.spreadFailed);
  const row = useWeekSession((s) => s.row);
  const onBoard = !!row && row.status === 'started' && stepOf(row) === 'board';
  const intention = (row?.answers.intention ?? '').trim();
  const spread = !!row?.spread;
  // Gremly's spread for these answers is not on the board yet: it is on its
  // way, or about to be asked for. The week cannot be finished until it is.
  const coming = !failed && (fitting || !spread || stale);
  return (
    <WeekBoard
      visible={open && onBoard && !!board}
      board={board}
      today={getDateService().ritualDay()}
      // opened to change one over-full day by hand, it says so, and its Done
      // only closes it: the week is finished from the board's own card
      title={relieving ? changeDayTitle(relieving) : undefined}
      sub={intention ? intentionQuote(intention) : board ? spanLabel(board.first, board.last) : ''}
      openOn={openOn}
      ownTag
      spread={spread && !failed}
      fitting={relieving ? fitting : coming}
      failed={failed}
      doneOff={!relieving && coming}
      saving={review.busy}
      onRetry={review.board.retry}
      onMove={review.board.move}
      onTick={review.board.tick}
      onToggleHabit={review.board.toggleHabit}
      onEaseHabit={review.board.easeHabit}
      onDone={relieving ? review.board.close : () => void review.board.done()}
      onClose={review.board.close}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  trail: { gap: 6, alignItems: 'flex-end' },
  // the bubbles sit close together here: the card's own gap does the spacing
  said: { marginTop: 0 },
  change: { paddingVertical: 2 },
});
