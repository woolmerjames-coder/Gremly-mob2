/**
 * Putting away Gremly's wrap up line for the day (lib/wrapup/dismiss.ts).
 */
const mockPatch = jest.fn();
const mockEnsure = jest.fn();
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: (...a: unknown[]) => mockPatch(...a),
  ensureDailyThread: (...a: unknown[]) => mockEnsure(...a),
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ userId: 'u1' }) },
}));

import { dismissWrapNudge } from '../dismiss';
import { useTodayThread } from '../../brief/todayThread';
import { getDateService } from '../../date/DateService';

const thread = (id: string) =>
  ({ id, metadata_json: { ritual_day: getDateService().ritualDay() } }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockPatch.mockResolvedValue(undefined);
  useTodayThread.setState({ thread: null });
});

describe('putting the wrap up line away', () => {
  it("is kept with today's thread, at once on every screen and saved for the day", async () => {
    useTodayThread.setState({ thread: thread('t1') });
    await dismissWrapNudge();
    const meta = useTodayThread.getState().thread?.metadata_json as any;
    expect(meta.wrap_nudge_dismissed_at).toBeTruthy();
    expect(mockPatch).toHaveBeenCalledWith('t1', {
      wrap_nudge_dismissed_at: meta.wrap_nudge_dismissed_at,
    });
  });

  it("makes today's thread to keep it when there is none yet", async () => {
    mockEnsure.mockResolvedValue(thread('t2'));
    await dismissWrapNudge();
    expect(mockEnsure).toHaveBeenCalledWith(getDateService().ritualDay());
    expect(mockPatch).toHaveBeenCalledWith('t2', expect.any(Object));
    expect(
      (useTodayThread.getState().thread?.metadata_json as any).wrap_nudge_dismissed_at,
    ).toBeTruthy();
  });
});
