/**
 * Daily brief in Chat: the shapes stored in the day's thread.
 *
 * The thread is a scope_chats row with chat_type 'daily' (one per person per
 * ritual day). Each message is a scope_chat_messages row whose
 * metadata_json.type says what it is. Gremly's words (brief-text, the offer
 * sentence) are assistant messages, so every later chat turn in the thread
 * carries them as history. Cards and event lines are system messages: the app
 * draws them from data each time they are shown.
 */

import type { AgentTask, DayChange } from '../cortex/CortexClient';
import type { Change } from '../changes/model';
import type { SweepRecord } from '../changes/sweep';
import type { ThreadBlock } from './dayRecord';
import type { KeepOffer, KeepPlace } from '../worlds/keep';

/** The part of the day a brief was written for. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

export type BriefMessageType =
  | 'brief-text'
  | 'brief-day-card'
  | 'brief-offer'
  | 'brief-plan'
  | 'brief-event'
  | 'brief-reply'
  | 'brief-changes'
  // the evening wrap up in the same thread (lib/wrapup)
  | 'sweep-recap'
  | 'sweep-receipt'
  | 'sweep-habits'
  | 'sweep-journal'
  | 'sweep-item'
  | 'sweep-end'
  // the weekly review in the same thread (lib/week)
  | 'week-card'
  | 'week-offer'
  // the Save button under a reply worth keeping (lib/worlds/keep.ts)
  | 'keep-offer';

/** Fields every brief message carries. */
interface BriefMetaBase {
  /**
   * Part of the evening wrap up, not of the brief. The brief's own readers
   * (yesterday's reaction, playback) leave these out.
   */
  wrap?: boolean;
  /**
   * Part of the weekly review (lib/week), not of the brief or the wrap up.
   * Its buttons are the review's to answer.
   */
  week?: boolean;
  /** One run of the writer; a rewrite on a later first open gets a new id */
  brief_id?: string;
  /** Set on lines a rewrite replaced before anyone saw them; never shown */
  superseded?: boolean;
}

/** One Gremly line, and the items it mentions (checked against the input). */
export interface BriefTextMeta extends BriefMetaBase {
  type: 'brief-text';
  part: DayPart;
  /** Ids of the meetings, todos, habits or facts this line mentions */
  ids?: string[];
  /**
   * Gremly's reply to the habit check in: the habit's week is drawn under it,
   * a dot for each day (components/brief/HabitWeekDots). The days are worked
   * out from the store each time, for the week `day` is in.
   */
  habit_week?: { habit_id: string; day: string };
}

/** The day card. Only the date is stored; it draws from the store every time. */
export interface BriefDayCardMeta extends BriefMetaBase {
  type: 'brief-day-card';
  date: string;
}

/**
 * What the offer is. plan: Plan my afternoon. sweep: Sweep first (a messy
 * backlog). return: the first open after time away. question: one of
 * Gremly's questions, answered with its choices. follow_up: Gremly's line
 * after Sweep or a reply. none: Gremly signs off.
 */
export type OfferKind =
  | 'plan'
  | 'sweep'
  | 'return'
  | 'question'
  | 'follow_up'
  | 'plan_edit'
  // Gremly asks what to put first before it plans (nothing was picked)
  | 'plan_ask'
  // what they picked only fits back to back: back to back, or with some space
  | 'plan_spacing'
  // what they picked and did not fit: another day, later, or left
  | 'plan_unfit'
  | 'none'
  // the evening wrap up
  | 'wrap_up'
  | 'wrap_partial'
  | 'wrap_declined'
  | 'journal'
  | 'wrap_close'
  // the weekly review (lib/week)
  | 'week_open' // Gremly offers the review: Let's do it, Not this week
  | 'week_retry' // the read could not be made: Try again, Not now
  | 'week_reasons' // one of the needs you cards, opened: Gremly's question and reasons to tap
  | 'week_day'; // after a review on another day: keep their weekly day, or move it

/** What tapping a button does. */
export type OfferAction =
  | 'plan' // propose a plan
  | 'sweep' // open the real Sweep
  | 'not_today' // Gremly signs off for now
  | 'what_can_wait' // Gremly says what can wait
  | 'catch_up' // counts from the time away, only when asked
  | 'just_today' // skip Sweep and keep to today
  | 'answer' // one of the question's choices
  | 'answer_other' // Something else: the next typed message is the answer
  | 'skip' // skip the question
  | 'add_kept' // add what Sweep kept to the plan already there
  | 'leave_plan' // leave the plan as it is
  | 'reach_yes' // add the reach item to today and plan
  | 'plan_edit' // a suggested change under the plan (value: the change)
  | 'plan_spacing' // the picks only fit back to back (value: tight or spaced)
  | 'plan_unfit' // todos picked that did not fit (value: tomorrow, later or leave)
  | 'thanks' // "Thanks, Gremly": Gremly says any time
  // the evening wrap up (lib/wrapup); 'sweep' opens the cards there too
  | 'sweep_skip' // move it all to tomorrow: one of the weekly skips
  | 'not_tonight' // no wrap up tonight; the journal stays one tap away
  | 'plan_week' // the weekly review, started in the thread
  | 'see_week' // the week they planned (Your week)
  // the morning check in on a habit planned for today (lib/brief/checkIn.ts)
  | 'habit_keep' // Still on
  | 'habit_move' // Move it to the day with the most room (value: the day)
  | 'habit_skip' // Skip this week: off today, and no more check ins this week
  | 'sweep_leave' // leave the cards that are left for the morning
  | 'journal_write' // the next typed message is tonight's journal entry
  | 'journal_page' // open the full journal page for tonight's entry
  | 'journal_mood' // pick a mood instead of writing
  | 'journal_skip' // no journal tonight
  | 'journal_only' // after Not tonight: just the journal
  | 'plan_tomorrow' // the planner, for tomorrow
  | 'night' // good night: the wrap up is done
  // the weekly review (lib/week)
  | 'week_start' // Let's do it
  | 'week_skip' // Not this week
  | 'week_retry' // ask for the read again
  | 'week_stop' // leave the review for now
  | 'week_not_quite' // Gremly's read is not quite right
  | 'week_talk' // one of the needs you cards, opened to talk through
  | 'week_reason' // a reason tapped under Gremly's question: sent to him as their words
  | 'week_typed' // what they typed to Gremly while the review is under way
  | 'week_just_plan' // take Gremly's guesses for the steps not done
  | 'week_keep_day' // their weekly day stays
  | 'week_move_day'; // the day of this review becomes their weekly day

export interface OfferButton {
  id: string;
  label: string;
  action: OfferAction;
  primary?: boolean;
  /** For answer buttons: the choice's words, saved as the answer */
  value?: string;
}

/** Gremly's offer sentence (the message content) and its buttons. */
export interface BriefOfferMeta extends BriefMetaBase {
  type: 'brief-offer';
  kind: OfferKind;
  buttons: OfferButton[];
  /** The gremly_questions row, for kind 'question' */
  question_id?: string;
  /**
   * What the question is about (gremly_questions.kind): one about a Chapter
   * is put as the Worlds card, with its own buttons (components/worlds/ChatAskCard)
   */
  question_kind?: string | null;
  /**
   * What the card's own buttons did: the line that says so, or, once Undo
   * was tapped, undone, and the card is there to answer again. The brief or
   * the wrap up carried on the first time, and does not again.
   */
  card?: { act: string; line: string } | { undone: true } | null;
  /** The button tapped, once one has been; the buttons go after that */
  chosen?: { id: string; at: string } | null;
  /** Waiting for the question to be answered or skipped; not shown until then */
  held?: boolean;
  /** Return day: what Catch me up says (the counts waiting in Sweep) */
  catch_up?: string;
  /** Minutes from local midnight where the first clear stretch starts, when planning is possible */
  plan_from?: number;
  /** The day a plan offer is for, when it is not today (plan_ask) */
  plan_day?: string;
  /** The held offer this one shows again, after the question */
  revealed_from?: string;
  /** The plan offer this one brings back after a change made in the thread (once) */
  brought_back_from?: string;
  /** After Sweep: what was kept for today, so the plan holds it */
  kept_ids?: string[];
  /**
   * plan_spacing: what they picked, kept on the message so the answer makes
   * the plan the same after the app has been closed
   */
  picks?: UnplacedItem[];
  /** plan_unfit: the todos they picked that did not fit, which the buttons act on */
  unfit?: { id: string; title: string }[];
  /** A quiet line under the buttons */
  hint?: string;
  /**
   * The brief's last message carries their week as facts (the worker's
   * brief/index.js), and the app shows them (lib/brief/checkIn.ts shownOffer).
   * checkin: a habit they planned for today. While it is still on, this
   * message is shown as the check in, with its own buttons; once it is
   * answered (asked), the offer itself follows as a new message.
   */
  checkin?: { habit_id: string; title: string; asked?: boolean };
  /** The weekly review is still to do: Plan my week is shown beside the offer's buttons */
  review_offer?: boolean;
  /**
   * The evening wrap up's question is a milestone's check in from their
   * weekly review, not one of Gremly's own (lib/wrapup/checkIns.ts): the
   * review that keeps it and what its journal entry needs. It has no
   * question_id, since it is not a gremly_questions row. Kept on the message,
   * so the answer is settled the same after the app has been closed.
   */
  milestone_checkin?: { row_id: string; id: string; goal: string; goal_date: string };
}

export type PlanStatus = 'proposal' | 'replaced' | 'dismissed' | 'locked';

/** One placed item: minutes from local midnight. */
export interface PlanItem {
  id: string;
  kind: 'todo' | 'habit' | 'reach';
  title: string;
  start: number;
  end: number;
  reason?: string | null;
  /** The window it may go in and how long it takes, so taps can re-fit it */
  window?: [number, number];
  minutes?: number;
  /** A reach that is a fact: it becomes a todo at Lock it in */
  fromFact?: boolean;
  /** The item's time in the store when the plan last saw it (lib/plan/livePlan.ts) */
  seen?: string;
  /**
   * A time the person set themselves (a card, a time changed on the item): it
   * stays there when the plan is fitted again, even after the plan would
   * otherwise end (lib/plan/planFlow.ts placePlan)
   */
  pinned?: boolean;
  /**
   * Picked by the person (Add something, kept in Sweep): it keeps its place
   * ahead of anything Gremly chose (lib/plan/planFlow.ts placePlan)
   */
  chosen?: boolean;
}

/** An item the picker chose that had no gap, kept so a change can try again. */
export interface UnplacedItem {
  id: string;
  title: string;
  kind?: 'todo' | 'habit' | 'reach';
  window?: [number, number];
  minutes?: number;
  reason?: string | null;
  fromFact?: boolean;
  /** Picked by the person (PlanItem.chosen) */
  chosen?: boolean;
}

export interface BriefPlanMeta extends BriefMetaBase {
  type: 'brief-plan';
  version: number;
  status: PlanStatus;
  /** The ritual day the plan is for */
  date: string;
  items: PlanItem[];
  /** Items the picker chose that had no gap that fits */
  unplaced: UnplacedItem[];
  /** Nothing is placed before this (minutes from midnight) */
  from?: number;
  /** Item ids in the picker's order (placing order when re-fitting) */
  order?: string[];
  /**
   * The gap kept between items and either side of meetings, in minutes. Left
   * out, it is the usual 15. A plan they asked for back to back has 0, and
   * keeps it each time it is fitted again (lib/plan/planFlow.ts placePlan).
   */
  buffer?: number;
}

/** One line such as "Swept 7 things, 3 kept for today". */
export interface BriefEventMeta extends BriefMetaBase {
  type: 'brief-event';
  /** time: a clock time alone, drawn as a quiet divider */
  icon?: 'sweep' | 'saved' | 'locked' | 'moved' | 'time';
}

/** The person's tap, shown as their message. */
export interface BriefReplyMeta extends BriefMetaBase {
  type: 'brief-reply';
  button_id: string;
  action: OfferAction;
}

/**
 * The card under Gremly's reply in today's thread: every change proposed for
 * one message, each with a tick, and Accept all or Not now
 * (lib/brief/useDayTurn.ts). The day turn's card has changes, each with its
 * own words; the agent's has card, in the change model's shape, and changes
 * is empty.
 */
export interface BriefChangesMeta extends BriefMetaBase {
  type: 'brief-changes';
  changes: DayChange[];
  /** The agent's card (agent plan step 7), drawn with lib/changes/words.ts */
  card?: Change[];
  /** What was asked, each proposed, needing an answer, not possible here or noted */
  checklist?: { ask: string; status: 'proposed' | 'needs_answer' | 'not_possible' | 'noted' }[];
  /** undone: everything it did was put back with its Undo */
  status: 'open' | 'applied' | 'dismissed' | 'undone';
  /** Changes the person unticked */
  unticked?: string[];
  /** After Apply: the changes made, and any that could not be */
  applied?: string[];
  failed?: string[];
  /** After Apply: the item each row made (a new item, or the one an item became), by row */
  created?: Record<string, string>;
  prompt_version?: string;
}

// ── The evening wrap up, in the same thread (lib/wrapup) ────────────────────

/** Gremly's opening card: the day in counts, from the app's own data. */
export interface SweepRecapMeta extends BriefMetaBase {
  type: 'sweep-recap';
  date: string;
  counts: { todos: number; habits: number; meetings: number; drops: number };
  /** What was finished today */
  done: { title: string; kind: 'todo' | 'habit' }[];
  /** On today's plan and not done */
  missed: { id: string; title: string }[];
  /** How much of today's plan got done, when there was one */
  planned?: { done: number; total: number } | null;
}

/** The cards' receipt. Its rows are the thread's decisions (DailyThreadMeta.sweep). */
export interface SweepReceiptMeta extends BriefMetaBase {
  type: 'sweep-receipt';
}

export interface SweepHabitRow {
  id: string;
  title: string;
  /** A habit being built is ticked; one being broken is held or not */
  kind: 'build' | 'break';
  /** Daily, 4 days running */
  note?: string;
  /**
   * For a habit they planned for today in their week: the day left in the
   * week it can move to when today did not happen (the brief's rule,
   * workers/shared/habitWeek.js). Left out when no day can take it.
   */
  move_to?: string;
}

/** Habits still open today, checked in on one card. */
export interface SweepHabitsMeta extends BriefMetaBase {
  type: 'sweep-habits';
  date: string;
  habits: SweepHabitRow[];
  /** Names of the habits already logged today */
  already?: string[];
  status: 'open' | 'saved';
  /** After saving: the habits logged, and what each break habit got */
  done?: string[];
  held?: Record<string, 'held' | 'not'>;
  /** After saving: the habits moved to another day of their week, by id, with the day */
  moved?: Record<string, string>;
  /** Asked before the evening, so the card's words do not say tonight */
  early?: boolean;
  /**
   * The check in on the habits they are breaking, asked by itself after the
   * journal when only the journal was wanted. The wrap up is over by then, so
   * saving this card is what says good night.
   */
  after_journal?: boolean;
}

/** Tonight's journal entry, or the mood picked instead. */
export interface SweepJournalMeta extends BriefMetaBase {
  type: 'sweep-journal';
  date: string;
  /** mood: picking moods, nothing saved yet */
  status: 'mood' | 'saved' | 'skipped' | 'removed';
  note_id?: string | null;
  title?: string;
  text?: string;
  /** An entry written on the journal page: each card's prompt (none for free writing) and its words */
  parts?: { q: string | null; text: string }[];
  moods?: string[];
  /** Asked before the evening, so the card's words do not say tonight */
  early?: boolean;
}

/** An item shown so it can be opened: the one a question was about. */
export interface SweepItemMeta extends BriefMetaBase {
  type: 'sweep-item';
  item: { id: string; kind: 'todo' | 'habit' | 'note'; title: string; when?: string };
}

/** The day, wrapped up. */
export interface SweepEndMeta extends BriefMetaBase {
  type: 'sweep-end';
  date: string;
}

// ── The weekly review, in the same thread (lib/week) ────────────────────────

/** The review's cards, in order. opening is its mark with the time; done is the summary. */
export type WeekCardKind =
  | 'opening'
  | 'challenge'
  | 'priorities'
  | 'shape'
  | 'intention'
  | 'ahead'
  | 'needs_you'
  | 'board'
  | 'done';

/**
 * One of the review's cards. It says which card it is and which week it is
 * for, and is drawn from that week's row each time it is shown
 * (weekly_reviews, held in lib/week/review/session). What does not change is
 * kept on the card itself, so a thread read back on a later day still shows
 * it: the time it was opened, what a step came to, and the summary.
 */
export interface WeekCardMeta extends BriefMetaBase {
  type: 'week-card';
  card: WeekCardKind;
  /** The first day of the week the review is for */
  week_start: string;
  /** opening: when it was opened, as "Sunday, 7:40 PM" */
  at?: string;
  /** A step's card: what they settled on it, as their message under the card */
  settled?: string | null;
  /** board: Gremly's line above the card, as it read when the week was planned */
  intro?: string;
  /** done: the week in short, as it stood when the card was made */
  summary?: { intention: string | null; tiles: { num: string; label: string }[] };
  /** done: shown again from the Week button (Your week), not at the end of a review */
  recap?: boolean;
}

/** The button to their week under a reply of Gremly's (the agent's offer_week). */
export interface WeekOfferMeta extends BriefMetaBase {
  type: 'week-offer';
  /** This week's review was done when the button was put, so it read Your week */
  done: boolean;
}

/** Something in a reply of Gremly's worth keeping, with the Save button under it (lib/worlds/keep.ts). */
export interface KeepOfferMeta extends BriefMetaBase, KeepOffer {
  type: 'keep-offer';
  /** Once saved: the note it made, and where it went */
  saved?: { id: string; place: KeepPlace } | null;
}

export type BriefMeta =
  | BriefTextMeta
  | BriefDayCardMeta
  | BriefOfferMeta
  | BriefPlanMeta
  | BriefEventMeta
  | BriefReplyMeta
  | BriefChangesMeta
  | SweepRecapMeta
  | SweepReceiptMeta
  | SweepHabitsMeta
  | SweepJournalMeta
  | SweepItemMeta
  | SweepEndMeta
  | WeekCardMeta
  | WeekOfferMeta
  | KeepOfferMeta;

/** Where tonight's wrap up has got to. */
export type WrapStep =
  | 'offer' // Gremly has opened on the day and offered the cards
  | 'cards' // the cards are open
  | 'partial' // the cards were closed part way
  | 'habits'
  | 'journal'
  | 'questions'
  | 'close' // the closing line and its buttons
  | 'done'
  | 'declined'; // Not tonight

/**
 * The wrap up's state, kept on the thread so it can be picked up from
 * anywhere and by Gremly: where it has got to, the cards there were, and each
 * decision in the change model's shape with what the item was before
 * (lib/changes/sweep.ts).
 */
export interface WrapUpState {
  started_at: string;
  /**
   * When the person last did anything in it. A wrap up can be started at any
   * hour, and one opened or turned down before the evening must not quiet the
   * evening's nudge: only what happened in the evening does.
   */
  touched_at?: string;
  step: WrapStep;
  /** How it went: the cards, a skip (moved on), or nothing to sort */
  path?: 'cards' | 'skip' | 'clear' | null;
  /** The cards there were when it started, so later ones are known as new */
  items: string[];
  decisions: SweepRecord[];
  /** When the cards were settled (sorted, left, moved on, or none): the Sweep counts as done */
  settled_at?: string | null;
  /** How many cards feeding has been credited for */
  credited?: number;
  journal?: 'written' | 'mood' | 'skipped' | null;
  /** Gremly has been fed for tonight's entry (once a night) */
  journal_fed?: boolean;
  /** After Not tonight: only the journal was wanted */
  journal_only?: boolean;
  /**
   * The habits they are breaking were checked in on by a card of their own,
   * after the journal on that path. They are asked once a day, so the habits
   * card leaves them out from then on.
   */
  break_asked?: boolean;
  /** Gremly's questions asked tonight */
  questions?: string[];
  finished_at?: string | null;
}

/** scope_chats.metadata_json on a daily thread. */
export interface DailyThreadMeta {
  ritual_day: string;
  /** When the brief's last line was first on screen */
  seen_at?: string | null;
  /** The first reply: a button, a day card row or a typed message */
  answered_at?: string | null;
  plan_locked_at?: string | null;
  /** The part of the day the current lines were written for */
  brief_part?: DayPart | null;
  brief_written_at?: string | null;
  /** Set once a later first open has asked for a fresh brief */
  rewrite_requested_at?: string | null;
  /** Set times added in the thread (lib/brief/dayRecord.ts) */
  fixed_blocks?: ThreadBlock[];
  /** Set times from memory taken off the day in the thread */
  fixed_removed?: string[];
  /** Habits skipped today in the thread: not planned again today */
  skipped_habits?: string[];
  /** The agent's task list in the thread, carried from one message to the next */
  agent_tasks?: AgentTask[];
  /** Tonight's wrap up (lib/wrapup) */
  sweep?: WrapUpState | null;
  /** When Gremly's wrap up line was put away for the day (lib/wrapup/dismiss.ts) */
  wrap_nudge_dismissed_at?: string | null;
}
