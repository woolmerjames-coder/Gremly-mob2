/**
 * The agent's card in Ask Gremly (agent plan step 9). When Gremly looks
 * something up or offers a change in a chat, the change comes as one card
 * under its reply, the same card as today's thread (components/brief/
 * ChangeCard.tsx). Accept, Accept all or Apply n writes the ticked changes
 * through the change model (lib/changes) and adds "Updated 3 things"; Undo
 * puts them back. What they did with a card goes into Gremly's history as a
 * line of the conversation (chatHistoryOf), so it never offers it again.
 */

import { useCallback, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import type { AgentTask } from '../cortex/CortexClient';
import type { Change } from '../changes/model';
import { applyChanges } from '../changes/apply';
import { briefMetaOf } from '../brief/messages';
import { changedEventText, undoneEventText } from '../brief/applyChanges';
import { cardOutcomeWords, DAY_TURN_COPY } from '../brief/useDayTurn';
import { useTodayThread } from '../brief/todayThread';
import { getDateService } from '../date/DateService';
import type { BriefChangesMeta, DailyThreadMeta } from '../brief/types';

const CHECKLIST: Record<string, 'proposed' | 'needs_answer' | 'not_possible' | 'noted'> = {
  proposed: 'proposed',
  needs_answer: 'needs_answer',
  not_possible: 'not_possible',
  done: 'noted',
};

/** The card message for an agent's reply: its rows, and the asks it answers. */
export function chatCardMeta(
  card: Change[],
  tasks: AgentTask[],
  promptVersion?: string,
): BriefChangesMeta {
  return {
    type: 'brief-changes',
    changes: [],
    card,
    checklist: tasks
      .filter((t) => CHECKLIST[t.status])
      .map((t) => ({ ask: t.ask, status: CHECKLIST[t.status] })),
    status: 'open',
    prompt_version: promptVersion,
  };
}

/**
 * The conversation as Gremly is told it: what was said, and what each card
 * came to, in words.
 */
export function chatHistoryOf(
  messages: SpaceChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    const meta = briefMetaOf(m);
    if (meta?.type === 'brief-changes') {
      const words = cardOutcomeWords(meta as BriefChangesMeta);
      if (words) out.push({ role: 'user', content: words });
      continue;
    }
    if ((m.role === 'user' || m.role === 'assistant') && m.content) {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/** Today's thread when it is loaded and is today's: skipping a habit today is kept on it. */
function todaysThreadId(): string | null {
  const t = useTodayThread.getState().thread;
  const day = (t?.metadata_json as Partial<DailyThreadMeta> | null | undefined)?.ritual_day;
  return t && day === getDateService().ritualDay() ? t.id : null;
}

export interface ChatCardDeps {
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  /** Gremly says a line in the chat */
  say: (text: string) => Promise<void>;
}

export function useChatCard(deps: ChatCardDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // what each applied card can put back, while this screen is open
  const undoRef = useRef(new Map<string, { revert: () => Promise<void>; count: number }>());
  const [undoable, setUndoable] = useState<string[]>([]);

  const hold = useCallback(async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const apply = useCallback(
    (message: SpaceChatMessage, unticked: string[]) =>
      hold(async () => {
        const d = depsRef.current;
        const meta = briefMetaOf(message);
        if (meta?.type !== 'brief-changes' || meta.status !== 'open' || !meta.card?.length) return;
        try {
          const rows = meta.card.filter((c) => !unticked.includes(c.cid));
          const { outcomes, revertAll } = await applyChanges(rows, {
            source: 'chat',
            threadId: todaysThreadId(),
          });
          const done = outcomes.filter((o) => o.ok).map((o) => o.cid);
          const failed = outcomes.filter((o) => !o.ok).map((o) => o.cid);
          if (done.length) {
            undoRef.current.set(message.id, { revert: revertAll, count: done.length });
            setUndoable((u) => [...u, message.id]);
          }
          await d.patchMessageMetadata(message.id, {
            status: 'applied',
            unticked,
            applied: done,
            failed,
          });
          if (done.length) {
            await d.appendBriefMessage('system', changedEventText(done.length), {
              type: 'brief-event',
              icon: 'saved',
            });
          }
          if (failed.length) await d.say(DAY_TURN_COPY.someFailed);
        } catch (err) {
          console.warn('[ChatCard] apply failed:', err);
        }
      }),
    [hold],
  );

  const dismiss = useCallback(
    (message: SpaceChatMessage) =>
      hold(async () => {
        const d = depsRef.current;
        const meta = briefMetaOf(message);
        if (meta?.type !== 'brief-changes' || meta.status !== 'open') return;
        await d.patchMessageMetadata(message.id, { status: 'dismissed' });
        await d.say(DAY_TURN_COPY.dismissed);
      }),
    [hold],
  );

  const undo = useCallback(
    (message: SpaceChatMessage) =>
      hold(async () => {
        const d = depsRef.current;
        const meta = briefMetaOf(message);
        const entry = undoRef.current.get(message.id);
        if (meta?.type !== 'brief-changes' || meta.status !== 'applied' || !entry) return;
        try {
          await entry.revert();
          undoRef.current.delete(message.id);
          setUndoable((u) => u.filter((x) => x !== message.id));
          await d.patchMessageMetadata(message.id, { status: 'undone' });
          await d.appendBriefMessage('system', undoneEventText(entry.count), {
            type: 'brief-event',
            icon: 'saved',
          });
        } catch (err) {
          console.warn('[ChatCard] undo failed:', err);
          await d.say(DAY_TURN_COPY.undoFailed);
        }
      }),
    [hold],
  );

  const canUndo = useCallback((messageId: string) => undoable.includes(messageId), [undoable]);

  return { busy, apply, dismiss, undo, canUndo };
}
