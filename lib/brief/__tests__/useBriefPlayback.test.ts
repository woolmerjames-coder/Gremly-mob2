import { renderHook, act } from '@testing-library/react-native';
import { beatBefore, briefSegment, useBriefPlayback } from '../useBriefPlayback';
import type { SpaceChatMessage } from '../../types';

function msg(id: string, role: string, meta: Record<string, unknown> | null) {
  return {
    id,
    chat_id: 't1',
    role,
    content: id,
    metadata_json: meta,
  } as unknown as SpaceChatMessage;
}

const BRIEF = [
  msg('l1', 'assistant', { type: 'brief-text', part: 'morning', brief_id: 'b2' }),
  msg('l2', 'assistant', { type: 'brief-text', part: 'morning', brief_id: 'b2' }),
  msg('card', 'system', { type: 'brief-day-card', date: '2026-10-01', brief_id: 'b2' }),
  msg('offer', 'assistant', { type: 'brief-offer', kind: 'plan', buttons: [], brief_id: 'b2' }),
];

describe('the brief playing in', () => {
  it('finds the newest brief, stopping at anything the person said', () => {
    const rows = [
      msg('old', 'assistant', { type: 'brief-text', part: 'morning', brief_id: 'b1' }),
      ...BRIEF,
      msg('me', 'user', { type: 'brief-reply', button_id: 'plan', action: 'plan', brief_id: 'b2' }),
    ];
    expect(briefSegment(rows)).toEqual({ start: 1, end: 4 });
    expect(briefSegment([msg('x', 'user', null)])).toBeNull();
  });

  it('gives lines longer to arrive than cards, and longer lines longer still', () => {
    expect(beatBefore(BRIEF[1], false)).toBeGreaterThan(beatBefore(BRIEF[2], false));
    const short = { ...BRIEF[1], content: 'Your afternoon is open.' } as SpaceChatMessage;
    const long = {
      ...BRIEF[1],
      content:
        'Your meetings are behind you, and the rest of the afternoon is completely open alongside your anniversary with Dave, with the plumber and Apple Calendar waiting.',
    } as SpaceChatMessage;
    expect(beatBefore(long, false)).toBeGreaterThan(beatBefore(short, false));
    // never so long that it drags
    const essay = { ...BRIEF[1], content: 'word '.repeat(400) } as SpaceChatMessage;
    expect(beatBefore(essay, false)).toBeLessThanOrEqual(2400);
    // a question is read like a line
    const question = {
      ...BRIEF[3],
      content: "Is Bella's vet on October 1 or 2?",
    } as SpaceChatMessage;
    expect(beatBefore(question, false)).toBeGreaterThan(beatBefore(BRIEF[2], false));
  });

  it('keeps an unseen brief out of sight until it plays, so it never flashes in full', () => {
    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useBriefPlayback({
          threadId: 't1',
          rows: BRIEF,
          seen: false,
          ready,
          reducedMotion: false,
          onSeen: jest.fn(),
        }),
      { initialProps: { ready: false } },
    );
    expect(result.current).toMatchObject({ hiddenFrom: 0, waiting: true, playing: false });
    rerender({ ready: true });
    expect(result.current).toMatchObject({ hiddenFrom: 0, waiting: false, playing: true });
  });

  it('shows one message at a time, waves, then marks the brief seen', async () => {
    jest.useFakeTimers();
    const onSeen = jest.fn();
    const onStart = jest.fn();
    const { result } = renderHook(() =>
      useBriefPlayback({
        threadId: 't1',
        rows: BRIEF,
        seen: false,
        ready: true,
        reducedMotion: false,
        onStart,
        onSeen,
      }),
    );
    expect(onStart).toHaveBeenCalled();
    expect(result.current).toMatchObject({ hiddenFrom: 0, typing: true, playing: true });
    const shown: (number | null)[] = [];
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1200);
      });
      shown.push(result.current.hiddenFrom);
    }
    // the brief grows a message at a time, then shows everything
    const during = shown.filter((h): h is number => h !== null);
    expect(during.length).toBeGreaterThan(1);
    expect(during).toEqual([...during].sort((a, b) => a - b));
    expect(result.current.hiddenFrom).toBeNull();
    expect(onSeen).toHaveBeenCalledWith('t1');
    jest.useRealTimers();
  });

  it('shows a seen brief at once, and with reduced motion counts it seen straight away', () => {
    const onSeen = jest.fn();
    const seen = renderHook(() =>
      useBriefPlayback({
        threadId: 't1',
        rows: BRIEF,
        seen: true,
        ready: true,
        reducedMotion: false,
        onSeen,
      }),
    );
    expect(seen.result.current.hiddenFrom).toBeNull();
    expect(onSeen).not.toHaveBeenCalled();
    renderHook(() =>
      useBriefPlayback({
        threadId: 't1',
        rows: BRIEF,
        seen: false,
        ready: true,
        reducedMotion: true,
        onSeen,
      }),
    );
    expect(onSeen).toHaveBeenCalledWith('t1');
  });
});
