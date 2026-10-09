/**
 * A tap on one of the question card's own buttons, wherever the card is: on
 * Worlds (app/tabs/WorldsScreen.tsx) or in the chat, under a question the
 * brief or the wrap up asks (components/worlds/ChatAskCard.tsx). Made through
 * the actions in lib/worlds/questions.ts, each with its Undo, and the
 * question marked answered there and then.
 */
import type { Chapter, World } from '../supabase/types';
import type { Undo } from './actions';
import {
  closeIt,
  moveIt,
  notNow,
  proposedWorld,
  startIt,
  stillGoing,
  type AskAct,
  type WorldsQuestion,
} from './questions';

/**
 * What a tap did: what puts it back, and the line that says what happened.
 * Throws when it could not be made, with nothing left half done.
 */
export async function actOn(
  q: WorldsQuestion,
  act: AskAct,
  ctx: {
    today: string;
    worlds: Pick<World, 'id' | 'phase'>[];
    chapters: Pick<Chapter, 'id' | 'title'>[];
  },
): Promise<{ undo: Undo; line: string }> {
  const p = q.proposal;
  const name =
    p.type === 'start'
      ? p.title
      : ctx.chapters.find((c) => c.id === p.chapter_id)?.title?.trim() || 'It';
  switch (act) {
    case 'start': {
      const made = await startIt(q, { worldId: proposedWorld(q, ctx.worlds) });
      return { undo: made.undo, line: `${made.chapter.title} is in motion now.` };
    }
    case 'no':
      return { undo: await notNow(q), line: 'Left as it is. Gremly will not suggest it again.' };
    case 'close':
      return { undo: await closeIt(q), line: `${name} is closed and part of your story.` };
    case 'move':
      return { undo: await moveIt(q), line: `${name} has its new dates.` };
    default:
      return { undo: await stillGoing(q, ctx.today), line: `${name} stays open.` };
  }
}

// what each card answered in the chat can put back, while the app is open
const chatUndos = new Map<string, Undo>();

/** Keep a card's Undo for its message in the chat. */
export function keepChatUndo(messageId: string, undo: Undo): void {
  chatUndos.set(messageId, undo);
}

/** Whether the card on this message can still be put back. */
export function canUndoChatAnswer(messageId: string): boolean {
  return chatUndos.has(messageId);
}

/** Put back what the card on this message did. Throws when it could not. */
export async function undoChatAnswer(messageId: string): Promise<void> {
  const undo = chatUndos.get(messageId);
  if (!undo) return;
  await undo();
  chatUndos.delete(messageId);
}
