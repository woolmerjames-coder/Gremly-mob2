/**
 * What Gremly says when Chat opens from "Talk it through with Gremly" on a
 * drop. These are fixed lines, not a model call, so opening Chat this way
 * costs nothing until the user sends something.
 *
 * Each line names the item. The opener is saved as Gremly's first message
 * when the user replies, so the conversation the model sees already says
 * what it is about.
 */

export type TalkAboutItem = {
  id: string;
  type: 'note' | 'todo' | 'habit';
  title: string;
  /** What the card calls it: Todo, Event, Journal... */
  label: string;
};

const OPENERS: ReadonlyArray<(title: string) => string> = [
  (t) => `Sure, let's talk about **${t}**. What's on your mind?`,
  (t) => `Happy to help with **${t}**. Where would you like to start?`,
  (t) => `**${t}**, got it. What would you like to talk through?`,
];

/** One of the openers, picked by `random` (0 to 1); Math.random by default */
export function talkAboutOpener(title: string, random: number = Math.random()): string {
  const clean = title.trim() || 'this';
  const index = Math.min(OPENERS.length - 1, Math.max(0, Math.floor(random * OPENERS.length)));
  return OPENERS[index](clean);
}

export const TALK_ABOUT_OPENER_COUNT = OPENERS.length;
