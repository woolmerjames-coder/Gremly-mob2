/**
 * A question about a Chapter in the brief or the wrap up (the gap from stage 3
 * of the Worlds rebuild): the Worlds card under Gremly's words, with what it
 * rests on and its own buttons; a tap is made at once, says what it did with
 * Undo, and lets the thread carry on the first time only.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ChatAskCard } from '../ChatAskCard';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import {
  closeIt,
  fetchWorldsQuestion,
  startIt,
  worldsQuestionFrom,
} from '../../../lib/worlds/questions';
import type { BriefOfferMeta } from '../../../lib/brief/types';

jest.mock('../../../lib/store/useGremlyStore', () => {
  const { create } = require('zustand');
  return { useGremlyStore: create(() => ({})) };
});
jest.mock('../../../lib/date/useDateService', () => ({ useToday: () => '2026-10-08' }));
jest.mock('../../../lib/worlds/questions', () => {
  const actual = jest.requireActual('../../../lib/worlds/questions');
  return {
    ...actual,
    fetchWorldsQuestion: jest.fn(),
    startIt: jest.fn(),
    notNow: jest.fn(),
    closeIt: jest.fn(),
    stillGoing: jest.fn(),
    moveIt: jest.fn(),
  };
});

const store = useGremlyStore as unknown as { setState: (s: object) => void };

// a stored question, as the data fabric writes them (inngest-jobs context/chapterQuestions.js)
const asked = (o: Record<string, unknown>) =>
  worldsQuestionFrom({
    status: 'open',
    choices: [],
    weight: null,
    created_at: '2026-10-07T05:00:00Z',
    asked_at: null,
    hold_until: null,
    record_table: null,
    record_id: null,
    rests_on: [],
    set_id: null,
    ...o,
  })!;
const suggestion = () =>
  asked({
    id: 'q1',
    kind: 'start_chapter',
    question: 'Shall I start a Chapter for the gate and the van?',
    proposed_change: { type: 'start', title: 'Yard tidy', world_id: 'w1', end_date: '2026-10-31' },
    rests_on: [{ table: 'todos', id: 't3' }],
  });

const offer = (over: Partial<BriefOfferMeta> = {}): BriefOfferMeta => ({
  type: 'brief-offer',
  kind: 'question',
  question_id: 'q1',
  question_kind: 'start_chapter',
  buttons: [],
  ...over,
});

function draw(meta: BriefOfferMeta, messageId = 'm1') {
  const patch = jest.fn();
  const onAnswered = jest.fn();
  const view = render(
    <ChatAskCard messageId={messageId} meta={meta} patch={patch} onAnswered={onAnswered} />,
  );
  return { ...view, patch, onAnswered };
}

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    worlds: [{ id: 'w1', name: 'Home', display_name: 'Home', phase: 'active' }],
    chapters: [
      { id: 'c3', title: 'Garden fence', phase: 'active', primary_world_id: 'w1', closed_at: null },
    ],
    todos: [{ id: 't3', title: 'Fix the gate', status: 'active' }],
    notes: [],
    habits: [],
  });
  (fetchWorldsQuestion as jest.Mock).mockResolvedValue(suggestion());
});

it('shows the card under Gremly’s words, with what it rests on, and its own words go in the box', async () => {
  const r = draw(offer());
  await waitFor(() => expect(r.getByTestId('ask-card')).toBeTruthy());
  expect(fetchWorldsQuestion).toHaveBeenCalledWith('q1');
  expect(r.getByText('Something is starting: Yard tidy')).toBeTruthy();
  expect(r.getByText('Fix the gate')).toBeTruthy();
  // Gremly has just asked it above, in his own words
  expect(r.getByTestId('ask-card')).not.toHaveTextContent(/Shall I start a Chapter/);
  expect(r.getByTestId('ask-hint')).toHaveTextContent(/in the box below/);
  expect(r.queryByTestId('ask-say')).toBeNull();
});

it('a tap makes it, says so with Undo, and lets the thread carry on once', async () => {
  const back = jest.fn(() => Promise.resolve());
  (startIt as jest.Mock).mockResolvedValue({
    chapter: { id: 'c9', title: 'Yard tidy' },
    undo: back,
  });
  const r = draw(offer(), 'm-start');
  await waitFor(() => expect(r.getByTestId('ask-primary')).toBeTruthy());
  await act(async () => fireEvent.press(r.getByTestId('ask-primary')));
  expect(startIt).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), { worldId: 'w1' });
  expect(r.patch).toHaveBeenCalledWith({
    chosen: expect.objectContaining({ id: 'card_start' }),
    card: { act: 'start', line: 'Yard tidy is in motion now.' },
  });
  expect(r.onAnswered).toHaveBeenCalledTimes(1);

  // the message now says what the card did
  const done = offer({
    chosen: { id: 'card_start', at: '2026-10-08T07:00:00Z' },
    card: { act: 'start', line: 'Yard tidy is in motion now.' },
  });
  r.rerender(
    <ChatAskCard messageId="m-start" meta={done} patch={r.patch} onAnswered={r.onAnswered} />,
  );
  expect(r.getByTestId('ask-done')).toHaveTextContent(/Yard tidy is in motion now\./);
  await act(async () => fireEvent.press(r.getByTestId('ask-undo')));
  expect(back).toHaveBeenCalled();
  expect(r.patch).toHaveBeenLastCalledWith({ card: { undone: true } });

  // undone: the card is there to answer again, and the thread does not move on twice
  const undone = offer({ chosen: done.chosen, card: { undone: true } });
  r.rerender(
    <ChatAskCard messageId="m-start" meta={undone} patch={r.patch} onAnswered={r.onAnswered} />,
  );
  await waitFor(() => expect(r.getByTestId('ask-primary')).toBeTruthy());
  await act(async () => fireEvent.press(r.getByTestId('ask-primary')));
  expect(r.patch).toHaveBeenLastCalledWith({
    card: { act: 'start', line: 'Yard tidy is in motion now.' },
  });
  expect(r.onAnswered).toHaveBeenCalledTimes(1);
});

it('a Chapter that looks finished closes with Close it', async () => {
  (fetchWorldsQuestion as jest.Mock).mockResolvedValue(
    asked({
      id: 'q2',
      kind: 'close_chapter',
      question: 'Is the fence done now?',
      record_table: 'chapters',
      record_id: 'c3',
      proposed_change: { type: 'close', chapter_id: 'c3', guess: 'over' },
    }),
  );
  (closeIt as jest.Mock).mockResolvedValue(jest.fn());
  const r = draw(offer({ question_id: 'q2', question_kind: 'close_chapter' }), 'm-close');
  await waitFor(() => expect(r.getByText('This looks finished: Garden fence')).toBeTruthy());
  await act(async () => fireEvent.press(r.getByTestId('ask-primary')));
  expect(closeIt).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }));
  expect(r.patch).toHaveBeenCalledWith(
    expect.objectContaining({
      card: { act: 'close', line: 'Garden fence is closed and part of your story.' },
    }),
  );
});

it('shows nothing more once answered in their own words, or answered somewhere else', async () => {
  const typed = draw(offer({ chosen: { id: 'typed', at: '2026-10-08T07:00:00Z' } }), 'm-typed');
  expect(typed.toJSON()).toBeNull();
  expect(fetchWorldsQuestion).not.toHaveBeenCalled();

  (fetchWorldsQuestion as jest.Mock).mockResolvedValue(null);
  const gone = draw(offer({ question_id: 'q-gone' }), 'm-gone');
  await waitFor(() => expect(fetchWorldsQuestion).toHaveBeenCalledWith('q-gone'));
  expect(gone.queryByTestId('ask-card')).toBeNull();
});

it('offers to try again when the card could not be read', async () => {
  (fetchWorldsQuestion as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const r = draw(offer({ question_id: 'q-offline' }), 'm-offline');
  await waitFor(() => expect(r.getByTestId('ask-retry')).toBeTruthy());
  await act(async () => fireEvent.press(r.getByTestId('ask-retry')));
  await waitFor(() => expect(r.getByTestId('ask-card')).toBeTruthy());
});
