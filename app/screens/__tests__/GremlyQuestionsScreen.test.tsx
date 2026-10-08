/**
 * A few questions for you (data fabric stage 4f): one at a time, what needs
 * an answer first; a tap sends the answer offered; a tidy up is done only on
 * their tap, for all, none or the ones they tick; Not now leaves it for
 * another day; the receipt says what each answer did.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AskQuestion } from '../../../lib/questions/askQuestions';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
}));
const mockNav = { goBack: (...a: any[]) => mockGoBack(...a), addListener: () => () => undefined };

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockAsk = jest.fn();
jest.mock('../../../lib/questions/askQuestions', () => ({
  ...jest.requireActual('../../../lib/questions/askQuestions'),
  fetchAskQuestions: () => mockAsk(),
}));

const mockAnswer = jest.fn();
const mockAsked = jest.fn();
jest.mock('../../../lib/story/storyApi', () => ({
  answerQuestion: (...a: any[]) => mockAnswer(...a),
  markQuestionAsked: (...a: any[]) => mockAsked(...a),
}));

import GremlyQuestionsScreen, { receiptLine, stillToCome } from '../GremlyQuestionsScreen';

const q = (id: string, more: Partial<AskQuestion> = {}): AskQuestion => ({
  id,
  kind: 'fact',
  question: `Question ${id}?`,
  choices: [],
  created_at: '2026-09-01T10:00:00Z',
  asked_at: null,
  record_table: null,
  record_id: null,
  private: false,
  weight: null,
  topic: null,
  why: null,
  tidy: null,
  ...more,
});

const birthday = q('bday', {
  question: 'I have two days for your birthday, 25 April and 30 April. Which is it?',
  choices: ['30 April', '25 April'],
  weight: 'needs',
  topic: 'Your birthday',
  why: 'From what you said in April, and a trip around the 25th.',
  created_at: '2026-10-01T10:00:00Z',
});
const sam = q('sam', {
  kind: 'person',
  question: 'Who is Sam to you?',
  choices: ['A colleague', 'A friend'],
  created_at: '2026-09-02T10:00:00Z',
});
const meetings = q('tidy', {
  kind: 'tidy',
  question:
    'These look like work meetings rather than things about your life. Shall I forget them?',
  choices: ['Forget them', 'Keep them'],
  topic: 'four work meetings',
  created_at: '2026-09-03T10:00:00Z',
  tidy: {
    type: 'set_aside',
    fact_ids: ['f1', 'f2', 'f3', 'f4'],
    yes: 'Forget them',
    no: 'Keep them',
    statements: [
      'Weekly team sync on Mondays',
      'Status call on 2 October',
      'Budget review on 29 September',
      'Planning session on 24 September',
    ],
    from_calendar: true,
  },
});

beforeEach(() => {
  mockAsk.mockResolvedValue([sam, meetings, birthday]);
  mockAnswer.mockResolvedValue(true);
  mockAsked.mockResolvedValue(undefined);
});

it('asks what needs an answer first, one at a time, with where it came from and what is still to come', async () => {
  const { findByText, getByText, getByTestId } = render(<GremlyQuestionsScreen />);
  expect(await findByText(birthday.question)).toBeTruthy();
  expect(getByTestId('questions-count').props.children.join('')).toBe('1 of 3');
  expect(getByText('NEEDS AN ANSWER')).toBeTruthy();
  expect(getByText(birthday.why as string)).toBeTruthy();
  expect(getByText('Who is Sam to you?')).toBeTruthy();
  expect(getByText('A tidy up: four work meetings')).toBeTruthy();
});

it('sends the answer they tap, Not now leaves one for another day, and a tidy up is done for the ones they tick', async () => {
  const { findByText, getByText, getByTestId, findByTestId } = render(<GremlyQuestionsScreen />);
  fireEvent.press(await findByText('30 April'));
  await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith('bday', '30 April', undefined));

  // Sam: left for now
  await findByText('Who is Sam to you?');
  fireEvent.press(getByTestId('not-now'));
  expect(mockAsked).toHaveBeenCalledWith('sam');

  // the tidy up, with its list and what it keeps
  await findByText('Weekly team sync on Mondays');
  expect(getByText('A TIDY UP')).toBeTruthy();
  expect(
    getByText('Your calendar keeps them. Gremly just stops treating them as part of your story.'),
  ).toBeTruthy();
  fireEvent.press(getByTestId('tidy-some'));
  // nothing ticked, nothing sent
  expect(getByTestId('tidy-some-yes').props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(getByTestId('tidy-row-0'));
  fireEvent.press(getByTestId('tidy-row-2'));
  fireEvent.press(getByTestId('tidy-some-yes'));
  await waitFor(() => expect(mockAnswer).toHaveBeenCalledWith('tidy', 'Forget them', ['f1', 'f3']));

  // the receipt: what each answer did, and nothing for the one left for now
  expect(await findByTestId('receipt-bday')).toBeTruthy();
  expect(getByText('Your birthday')).toBeTruthy();
  expect(getByText('30 April. Updated everywhere.')).toBeTruthy();
  expect(getByText('2 forgotten. Your calendar still has them.')).toBeTruthy();
  expect(() => getByTestId('receipt-sam')).toThrow();
  expect(getByText('That’s everything for now. Thank you.')).toBeTruthy();
  fireEvent.press(getByTestId('questions-done'));
  expect(mockGoBack).toHaveBeenCalled();
});

it('stays on the question and says so when an answer does not send', async () => {
  mockAsk.mockResolvedValue([birthday]);
  mockAnswer.mockResolvedValue(false);
  const { findByText, getByText } = render(<GremlyQuestionsScreen />);
  fireEvent.press(await findByText('25 April'));
  expect(await findByText('That didn’t send. Try again in a moment.')).toBeTruthy();
  expect(getByText(birthday.question)).toBeTruthy();
});

it('takes their own words with Something else', async () => {
  mockAsk.mockResolvedValue([birthday]);
  const { findByTestId, getByLabelText, getByText, findByText } = render(<GremlyQuestionsScreen />);
  fireEvent.press(await findByTestId('something-else'));
  fireEvent.changeText(
    getByLabelText(`Answer: ${birthday.question}`),
    'Neither, it is the 3rd of May',
  );
  fireEvent.press(getByText('Send'));
  await waitFor(() =>
    expect(mockAnswer).toHaveBeenCalledWith('bday', 'Neither, it is the 3rd of May', undefined),
  );
  expect(await findByText('Thanks. Updated everywhere.')).toBeTruthy();
});

it('says so when nothing is waiting', async () => {
  mockAsk.mockResolvedValue([]);
  const { findByText } = render(<GremlyQuestionsScreen />);
  expect(
    await findByText(
      'Nothing right now. When your records leave something unclear, it shows up here.',
    ),
  ).toBeTruthy();
});

test('the receipt line and Still to come', () => {
  expect(receiptLine(meetings, { said: 'Forget them' })).toBe(
    'Forgotten. Your calendar still has them.',
  );
  expect(receiptLine(meetings, { said: 'Keep them' })).toBe('Kept as they are.');
  expect(
    receiptLine(
      { ...meetings, tidy: { ...meetings.tidy!, type: 'happened', yes: 'They did' } },
      { said: 'They did', picked: 1 },
    ),
  ).toBe('1 marked as done.');
  expect(receiptLine(sam, { said: 'A colleague' })).toBe('A colleague. Noted.');
  expect(stillToCome({ ...meetings, topic: null })).toBe('A tidy up');
  expect(stillToCome(sam)).toBe('Who is Sam to you?');
});
