/**
 * dropCalls: calls started for a drop and read later (Mind Drop rethink stage 4).
 */
import { keyedCalls, within } from '../dropCalls';

describe('keyedCalls', () => {
  it('starts a call once per drop and gives back the same call after', async () => {
    const calls = keyedCalls<string>();
    const run = jest.fn().mockResolvedValue('answer');
    const first = calls.start('d1', run);
    const again = calls.start('d1', run);
    expect(again).toBe(first);
    expect(await first.promise).toBe('answer');
    expect(first).toMatchObject({ done: true, value: 'answer' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('turns a call that throws into null, never a rejection', async () => {
    const calls = keyedCalls<string>();
    const c = calls.start('d1', () => Promise.reject(new Error('offline')));
    expect(await c.promise).toBeNull();
    expect(c.done).toBe(true);
  });

  it('forgets a drop, so the next start asks again', async () => {
    const calls = keyedCalls<number>();
    const run = jest.fn().mockResolvedValue(1);
    await calls.start('d1', run).promise;
    calls.forget('d1');
    expect(calls.get('d1')).toBeNull();
    await calls.start('d1', run).promise;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('lets the oldest go when too many are kept', () => {
    const calls = keyedCalls<number>();
    for (let i = 0; i < 51; i += 1) calls.start(`d${i}`, () => new Promise(() => {}));
    expect(calls.get('d0')).toBeNull();
    expect(calls.get('d50')).not.toBeNull();
  });
});

describe('within', () => {
  it('gives the answer when the call ends in time', async () => {
    const calls = keyedCalls<string>();
    const c = calls.start('d1', () => Promise.resolve('yes'));
    expect(await within(c, 50)).toBe('yes');
  });

  it('gives undefined when the call has not ended, and the call carries on', async () => {
    const calls = keyedCalls<string>();
    let finish: (v: string) => void = () => {};
    const c = calls.start('d1', () => new Promise<string>((r) => (finish = r)));
    await Promise.resolve();
    expect(await within(c, 10)).toBeUndefined();
    finish('late');
    expect(await c.promise).toBe('late');
    expect(await within(c, 0)).toBe('late');
  });
});
