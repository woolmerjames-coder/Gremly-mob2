/**
 * The brief playing in (Daily brief in Chat): the first time today's brief is
 * on screen, its messages arrive one at a time with Gremly typing between
 * them, and Gremly waves as it starts. Once the last one is on screen the
 * brief counts as seen. Seen briefs, and reduced motion, show at once.
 *
 * An unseen brief stays hidden until it plays (waiting), so it never shows
 * in full for a moment first. The pace leaves time to read: Gremly types a
 * line for longer the longer it is.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import { briefMetaOf } from './messages';

/** Typing time before each kind of message, in ms */
const BEAT_MS = {
  first: 700,
  /** a card, the plan or an event line */
  card: 900,
  /** a line of words: a base, plus a little for each word, within these bounds */
  lineBase: 900,
  perWord: 35,
  lineMin: 1300,
  lineMax: 2400,
} as const;

/**
 * The run of rows that make up the newest brief: from its first message to
 * its last, stopping at anything the person said.
 */
export function briefSegment(rows: SpaceChatMessage[]): { start: number; end: number } | null {
  let briefId: string | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const meta = briefMetaOf(rows[i]);
    if (meta?.type === 'brief-text' && meta.brief_id) {
      briefId = meta.brief_id;
      break;
    }
  }
  if (!briefId) return null;
  const start = rows.findIndex((m) => briefMetaOf(m)?.brief_id === briefId);
  if (start < 0) return null;
  let end = start;
  for (let i = start + 1; i < rows.length; i++) {
    const meta = briefMetaOf(rows[i]);
    if (rows[i].role === 'user' || meta?.brief_id !== briefId) break;
    end = i;
  }
  return { start, end };
}

/** How long Gremly types before the row at this index arrives. */
export function beatBefore(row: SpaceChatMessage, isFirst: boolean): number {
  if (isFirst) return BEAT_MS.first;
  const type = briefMetaOf(row)?.type;
  const words = (row.content || '').trim().split(/\s+/).filter(Boolean).length;
  // a line, or an offer that says something: typed for longer the longer it is
  if (type === 'brief-text' || (type === 'brief-offer' && words > 0)) {
    const ms = BEAT_MS.lineBase + BEAT_MS.perWord * words;
    return Math.min(BEAT_MS.lineMax, Math.max(BEAT_MS.lineMin, ms));
  }
  return BEAT_MS.card;
}

export interface BriefPlaybackInput {
  /** The thread on screen, when it is a daily thread */
  threadId: string | null;
  rows: SpaceChatMessage[];
  /** The thread's brief has been seen already */
  seen: boolean;
  /** On screen, loaded and not being written */
  ready: boolean;
  reducedMotion: boolean;
  onStart?: () => void;
  /** The last line has been on screen */
  onSeen: (threadId: string) => void;
}

export interface BriefPlayback {
  /** Rows from this index on are not shown yet; null shows everything */
  hiddenFrom: number | null;
  /** Gremly is typing the next message */
  typing: boolean;
  playing: boolean;
  /** An unseen brief that has not started playing yet: hidden until it does */
  waiting: boolean;
}

export function useBriefPlayback(input: BriefPlaybackInput): BriefPlayback {
  const { threadId, rows, seen, ready, reducedMotion } = input;
  const inputRef = useRef(input);
  inputRef.current = input;
  const segment = useMemo(() => briefSegment(rows), [rows]);
  const [state, setState] = useState<Omit<BriefPlayback, 'waiting'>>({
    hiddenFrom: null,
    typing: false,
    playing: false,
  });
  const playedRef = useRef<string | null>(null);
  const segKey = threadId && segment ? `${threadId}:${segment.start}` : null;

  useEffect(() => {
    if (!threadId || !segment || !segKey || seen || !ready) return;
    if (playedRef.current === segKey) return;
    playedRef.current = segKey;
    let cancelled = false;
    let completed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(setTimeout(resolve, ms));
      });

    (async () => {
      if (reducedMotion) {
        completed = true;
        inputRef.current.onSeen(threadId);
        return;
      }
      inputRef.current.onStart?.();
      setState({ hiddenFrom: segment.start, typing: true, playing: true });
      for (let i = segment.start; i <= segment.end; i++) {
        const row = inputRef.current.rows[i];
        if (!row) break;
        setState({ hiddenFrom: i, typing: true, playing: true });
        await wait(beatBefore(row, i === segment.start));
        if (cancelled) return;
        setState({ hiddenFrom: i + 1, typing: false, playing: true });
      }
      if (cancelled) return;
      completed = true;
      setState({ hiddenFrom: null, typing: false, playing: false });
      inputRef.current.onSeen(threadId);
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // left before the end: it plays again next time
      if (!completed && playedRef.current === segKey) playedRef.current = null;
      setState({ hiddenFrom: null, typing: false, playing: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, segKey, seen, ready, reducedMotion]);

  // unseen and not played yet: kept out of sight until it plays
  if (
    threadId &&
    segment &&
    segKey &&
    !seen &&
    !reducedMotion &&
    playedRef.current !== segKey &&
    state.hiddenFrom === null
  ) {
    return { hiddenFrom: segment.start, typing: false, playing: false, waiting: true };
  }
  return { ...state, waiting: false };
}
