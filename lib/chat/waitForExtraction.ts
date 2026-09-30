/**
 * The Save items pill and a late card arrive a few seconds after Gremly's
 * reply, from the Worker's background extraction, and that can take longer
 * than the reply did. The app waits for this turn's own marker (the turn id it
 * sent, written back with the extraction) instead of polling twice and hoping.
 * An older Worker writes no marker and sends no extraction flag: then the two
 * polls the app always made.
 */

/** When to look again, in milliseconds after the reply finished. */
export const EXTRACTION_POLLS_MS: readonly number[] = [
  2000, 3500, 5000, 6500, 8000, 10000, 12000, 15000, 18000, 22000, 26000,
];
/** An older Worker: the two looks the app always made. */
export const LEGACY_POLLS_MS: readonly number[] = [2000, 5000];

export interface WaitForExtractionDeps {
  /** Fetch the chat's extraction into the store; resolves with the turn it is for. */
  fetch: () => Promise<string | null>;
  /** Wait this many milliseconds. */
  sleep: (ms: number) => Promise<void>;
  /** False once the user has left this chat: stop looking. */
  stillHere: () => boolean;
}

/**
 * @param extraction what the Worker said at the end of the reply: 'running',
 *   'skipped' (nothing will come, for a turn it does not extract from), or
 *   undefined from a Worker that does not say
 */
export async function waitForExtraction(
  turnId: string,
  extraction: string | undefined,
  deps: WaitForExtractionDeps,
): Promise<'landed' | 'skipped' | 'gave_up' | 'left'> {
  if (extraction === 'skipped') return 'skipped';
  const polls = extraction === 'running' ? EXTRACTION_POLLS_MS : LEGACY_POLLS_MS;
  let at = 0;
  for (const when of polls) {
    await deps.sleep(when - at);
    at = when;
    if (!deps.stillHere()) return 'left';
    const turn = await deps.fetch().catch(() => null);
    if (turn && turn === turnId) return 'landed';
  }
  return 'gave_up';
}
