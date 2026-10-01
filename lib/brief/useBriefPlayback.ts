/**
 * The brief playing in (Daily brief in Chat): the first time today's brief is
 * on screen, its messages arrive one at a time with Gremly typing between
 * them, and Gremly waves as it starts. Once the last one is on screen the
 * brief counts as seen. Seen briefs, and reduced motion, show at once.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import { briefMetaOf } from './messages';

/** Typing time before each kind of message, in ms */
const BEAT_MS = { first: 600, text: 1100, other: 450 } as const;

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
  return briefMetaOf(row)?.type === 'brief-text' ? BEAT_MS.text : BEAT_MS.other;
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
}

export function useBriefPlayback(input: BriefPlaybackInput): BriefPlayback {
  const { threadId, rows, seen, ready, reducedMotion } = input;
  const inputRef = useRef(input);
  inputRef.current = input;
  const segment = useMemo(() => briefSegment(rows), [rows]);
  const [state, setState] = useState<BriefPlayback>({
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(setTimeout(resolve, ms));
      });

    (async () => {
      if (reducedMotion) {
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
      setState({ hiddenFrom: null, typing: false, playing: false });
      inputRef.current.onSeen(threadId);
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // left before the end: it plays again next time
      if (playedRef.current === segKey) playedRef.current = null;
      setState({ hiddenFrom: null, typing: false, playing: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, segKey, seen, ready, reducedMotion]);

  return state;
}
