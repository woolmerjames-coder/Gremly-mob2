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

import type { DayChange } from '../cortex/CortexClient';
import type { ThreadBlock } from './dayRecord';

/** The part of the day a brief was written for. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

export type BriefMessageType =
  | 'brief-text'
  | 'brief-day-card'
  | 'brief-offer'
  | 'brief-plan'
  | 'brief-event'
  | 'brief-reply'
  | 'brief-changes';

/** Fields every brief message carries. */
interface BriefMetaBase {
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
  | 'none';

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
  | 'thanks'; // "Thanks, Gremly": Gremly says any time

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
  /** The button tapped, once one has been; the buttons go after that */
  chosen?: { id: string; at: string } | null;
  /** Waiting for the question to be answered or skipped; not shown until then */
  held?: boolean;
  /** Return day: what Catch me up says (the counts waiting in Sweep) */
  catch_up?: string;
  /** Minutes from local midnight where the first clear stretch starts, when planning is possible */
  plan_from?: number;
  /** The held offer this one shows again, after the question */
  revealed_from?: string;
  /** The plan offer this one brings back after a change made in the thread (once) */
  brought_back_from?: string;
  /** After Sweep: what was kept for today, so the plan holds it */
  kept_ids?: string[];
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
}

/** One line such as "Swept 7 things, 3 kept for today". */
export interface BriefEventMeta extends BriefMetaBase {
  type: 'brief-event';
  icon?: 'sweep' | 'saved' | 'locked';
}

/** The person's tap, shown as their message. */
export interface BriefReplyMeta extends BriefMetaBase {
  type: 'brief-reply';
  button_id: string;
  action: OfferAction;
}

/**
 * The day turn's card: every change it proposes for one message, each with a
 * tick, and Apply or Not now (lib/brief/useDayTurn.ts).
 */
export interface BriefChangesMeta extends BriefMetaBase {
  type: 'brief-changes';
  changes: DayChange[];
  /** What was asked, each proposed, needing an answer, not possible here or noted */
  checklist?: { ask: string; status: 'proposed' | 'needs_answer' | 'not_possible' | 'noted' }[];
  /** undone: everything it did was put back with its Undo */
  status: 'open' | 'applied' | 'dismissed' | 'undone';
  /** Changes the person unticked */
  unticked?: string[];
  /** After Apply: the changes made, and any that could not be */
  applied?: string[];
  failed?: string[];
  prompt_version?: string;
}

export type BriefMeta =
  | BriefTextMeta
  | BriefDayCardMeta
  | BriefOfferMeta
  | BriefPlanMeta
  | BriefEventMeta
  | BriefReplyMeta
  | BriefChangesMeta;

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
}
