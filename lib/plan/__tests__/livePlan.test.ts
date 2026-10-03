/**
 * The living plan: a time changed elsewhere moves the item on the plan card.
 */
import { changedStart, syncPlanItems, timeSignature } from '../livePlan';
import type { PlanItem } from '../../brief/types';

jest.mock('../../brief/time', () => ({
  hhmmToMinutes: (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)),
  // ISO strings here are written as local "YYYY-MM-DDTHH:MM"
  localDateOf: (iso: string) => iso.slice(0, 10),
  minutesOfDay: (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)),
}));

const date = '2026-10-02';
const callMum: PlanItem = {
  id: 'mum',
  kind: 'todo',
  title: 'Call Mum',
  start: 710,
  end: 730,
};

describe('the living plan', () => {
  it('first sight only records the time', () => {
    const todo = { scheduled_start_iso: '2026-10-02T11:50', due_time: null };
    const sync = syncPlanItems([callMum], date, () => todo);
    expect(sync?.moved).toEqual([]);
    expect(sync?.items[0]).toMatchObject({ start: 710, seen: timeSignature(todo) });
  });

  it('2 October: the card moved Call Mum to 12:00, so the plan says 12:00', () => {
    const before = { scheduled_start_iso: '2026-10-02T11:50', due_time: null };
    const item = { ...callMum, seen: timeSignature(before) };
    const after = { ...before, due_time: '12:00' };
    const sync = syncPlanItems([item], date, () => after);
    expect(sync?.moved).toEqual(['mum']);
    expect(sync?.items[0]).toMatchObject({ start: 720, end: 740, seen: timeSignature(after) });
  });

  it('nothing changed, nothing to do', () => {
    const todo = { scheduled_start_iso: '2026-10-02T11:50', due_time: null };
    expect(syncPlanItems([{ ...callMum, seen: timeSignature(todo) }], date, () => todo)).toBeNull();
  });

  it('a time on another day does not move it', () => {
    const seen = timeSignature({ scheduled_start_iso: '2026-10-02T11:50' });
    expect(changedStart({ scheduled_start_iso: '2026-10-03T09:00' }, seen, date)).toBeNull();
    expect(changedStart({ due_time: '09:00', due_day: '2026-10-03' }, seen, date)).toBeNull();
  });

  it('a new planned start on the day moves it (the Today tab)', () => {
    const seen = timeSignature({ scheduled_start_iso: '2026-10-02T11:50' });
    expect(changedStart({ scheduled_start_iso: '2026-10-02T15:30' }, seen, date)).toBe(930);
  });

  it('a suggestion from what they said has nothing in the store to follow', () => {
    const reach: PlanItem = {
      id: 'f1',
      kind: 'reach',
      title: 'Book the car',
      start: 900,
      end: 920,
    };
    expect(syncPlanItems([reach], date, () => undefined)).toBeNull();
  });
});
