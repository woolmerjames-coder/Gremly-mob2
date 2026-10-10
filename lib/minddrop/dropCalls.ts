/**
 * dropCalls.ts: calls the drop pipeline starts for a drop and reads later,
 * kept in memory by the drop's local id (Mind Drop rethink stage 4, 9 Oct 2026).
 *
 * The new order starts each call the moment it can (the title and reaction
 * and the already have it check at the tap, the details and the question's
 * words at the sort) and reads each one when the drop needs it, or attaches it
 * whenever it lands. A started call can be read before it ends (`done`), so
 * the pipeline never waits on one it does not need yet.
 *
 * Memory only: after an app restart a drop starts its calls again, and every
 * call here is safe to repeat. A call must never reject; any failure resolves
 * to null.
 */

export interface StartedCall<T> {
  promise: Promise<T | null>;
  /** true once the call has ended, with its answer in `value` (null when it failed) */
  done: boolean;
  value: T | null;
}

/** More than this many drops in flight is a leak: the oldest are let go. */
const MAX_KEPT = 50;

export interface KeyedCalls<T> {
  /** Start the call for this drop, or return the one already started. */
  start(id: string, run: () => Promise<T | null>): StartedCall<T>;
  /** The call started for this drop, or null when none has been. */
  get(id: string): StartedCall<T> | null;
  /** Let the call go (the drop no longer needs it). */
  forget(id: string): void;
}

export function keyedCalls<T>(): KeyedCalls<T> {
  const calls = new Map<string, StartedCall<T>>();
  return {
    start(id, run) {
      const have = calls.get(id);
      if (have) return have;
      while (calls.size >= MAX_KEPT) {
        const oldest = calls.keys().next().value;
        if (oldest === undefined) break;
        calls.delete(oldest);
      }
      const call: StartedCall<T> = { promise: Promise.resolve(null), done: false, value: null };
      call.promise = Promise.resolve()
        .then(run)
        .catch(() => null)
        .then((value) => {
          call.done = true;
          call.value = value ?? null;
          return call.value;
        });
      calls.set(id, call);
      return call;
    },
    get(id) {
      return calls.get(id) ?? null;
    },
    forget(id) {
      calls.delete(id);
    },
  };
}

/**
 * The call's answer if it ends within `ms`; `undefined` when it has not ended
 * by then (it carries on, and can be read again later).
 */
export async function within<T>(call: StartedCall<T>, ms: number): Promise<T | null | undefined> {
  if (call.done) return call.value;
  if (ms <= 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  const result = await Promise.race([call.promise, late]);
  if (timer) clearTimeout(timer);
  return result;
}
