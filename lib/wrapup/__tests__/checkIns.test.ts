/**
 * A milestone's check ins in the evening wrap up (lib/wrapup/checkIns.ts):
 * which are asked tonight, and what an answer or a skip does.
 */
import {
  CHECKIN_LATE_DAYS,
  answerCheckIn,
  checkInAsk,
  checkInQuestion,
  fetchCheckInQuestions,
  isCheckIn,
  skipCheckIn,
} from '../checkIns';
import { getDueCheckIns, settleCheckIn } from '../../repo/weekReviewRepo';
import { saveCheckIn } from '../journal';

jest.mock('../../repo/weekReviewRepo', () => ({
  getDueCheckIns: jest.fn(),
  settleCheckIn: jest.fn(),
}));
jest.mock('../journal', () => ({ saveCheckIn: jest.fn() }));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ userId: 'user-1' }) },
}));
const mockSetReview = jest.fn();
jest.mock('../../week/thisWeek', () => ({
  useThisWeek: { getState: () => ({ setReview: mockSetReview }) },
}));
const mockRowSaved = jest.fn();
jest.mock('../../week/review/session', () => ({ rowSaved: (r: unknown) => mockRowSaved(r) }));

const DAY = '2026-10-08';
const due = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  goal: 'Send the grant application',
  goal_date: '2026-10-20',
  date: DAY,
  title: 'See how the draft is coming along',
  status: 'open' as const,
  row_id: 'row-1',
  ...over,
});

beforeEach(() => {
  (getDueCheckIns as jest.Mock).mockResolvedValue([]);
  (settleCheckIn as jest.Mock).mockResolvedValue({ id: 'row-1', checkins: [] });
  (saveCheckIn as jest.Mock).mockResolvedValue({ ok: true, noteId: 'n1' });
});

describe('which check ins are asked tonight', () => {
  it('reads the ones due today, and any missed in the last few days', async () => {
    (getDueCheckIns as jest.Mock).mockResolvedValue([
      due('late', { date: '2026-10-06' }),
      due('c1'),
    ]);
    const asked = await fetchCheckInQuestions(DAY);
    expect(CHECKIN_LATE_DAYS).toBe(3);
    expect(getDueCheckIns).toHaveBeenCalledWith('user-1', '2026-10-05', DAY);
    expect(asked.map((q) => q.id)).toEqual(['checkin:late', 'checkin:c1']);
  });

  it('asks two at most in one evening, the earliest first', async () => {
    (getDueCheckIns as jest.Mock).mockResolvedValue([due('a'), due('b'), due('c')]);
    expect((await fetchCheckInQuestions(DAY)).map((q) => q.id)).toEqual(['checkin:a', 'checkin:b']);
  });

  it('is a question in a fixed sentence around their own goal, answered by typing', () => {
    const q = checkInQuestion(due('c1'));
    expect(q).toMatchObject({
      id: 'checkin:c1',
      question: 'You set a check in on “Send the grant application”. How is it going?',
      choices: [],
      private: false,
      record_id: null,
    });
    expect(checkInAsk('Run the 10k')).toBe('You set a check in on “Run the 10k”. How is it going?');
    expect(isCheckIn(q)).toBe(true);
    expect(isCheckIn({})).toBe(false);
    expect(isCheckIn(null)).toBe(false);
  });
});

describe('an answer to a check in', () => {
  // the check in as its question's message keeps it
  const asked = {
    row_id: 'row-1',
    id: 'c1',
    goal: 'Send the grant application',
    goal_date: '2026-10-20',
  };

  it('is written to their journal as a goal check in, then the check in is marked done', async () => {
    expect(await answerCheckIn(asked, 'Half done, on track.')).toBe(true);
    expect(saveCheckIn).toHaveBeenCalledWith({
      text: 'Half done, on track.',
      moods: [],
      // a milestone belongs to no Space
      goal: { goal_id: 'milestone:c1', goal_name: 'Send the grant application' },
      milestone: { date: '2026-10-20', checkin_id: 'c1' },
    });
    expect(settleCheckIn).toHaveBeenCalledWith('row-1', 'c1', 'done');
    // the app's copies of the review follow
    expect(mockSetReview).toHaveBeenCalledWith({ id: 'row-1', checkins: [] });
    expect(mockRowSaved).toHaveBeenCalledWith({ id: 'row-1', checkins: [] });
  });

  it('stays open when the journal entry could not be saved', async () => {
    (saveCheckIn as jest.Mock).mockResolvedValue({ ok: false, message: 'offline' });
    expect(await answerCheckIn(asked, 'Half done.')).toBe(false);
    expect(settleCheckIn).not.toHaveBeenCalled();
  });

  it('counts as saved when only the mark on the review failed: their words are in the journal', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (settleCheckIn as jest.Mock).mockRejectedValue(new Error('offline'));
    expect(await answerCheckIn(asked, 'Half done.')).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a check in they pass on', () => {
  const asked = {
    row_id: 'row-1',
    id: 'c1',
    goal: 'Send the grant application',
    goal_date: '2026-10-20',
  };

  it('is marked skipped on its review', async () => {
    await skipCheckIn(asked);
    expect(settleCheckIn).toHaveBeenCalledWith('row-1', 'c1', 'skipped');
    expect(saveCheckIn).not.toHaveBeenCalled();
  });

  it('touches no copy of the review when it was no longer there', async () => {
    (settleCheckIn as jest.Mock).mockResolvedValue(null);
    await skipCheckIn(asked);
    expect(mockSetReview).not.toHaveBeenCalled();
  });
});
