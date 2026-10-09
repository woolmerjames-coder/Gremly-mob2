/**
 * Gremly's questions that may be asked today (lib/questions/askQuestions.ts),
 * read when the screen opens and again each time it comes back into focus, so
 * an answer given elsewhere shows on return. loaded is true once the first
 * read has come back, or failed: Ask Gremly's greeting waits for it, so it
 * knows whether questions are waiting.
 *
 * Focus comes from the screen's navigation when it has one: Ask Gremly also
 * renders outside any screen (an item's chat), where there is no focus to
 * follow and no questions are read (enabled false).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDateService } from '../date/DateService';
import {
  askQuestionsFor,
  fetchAskQuestions,
  questionsWaiting,
  type AskQuestion,
} from './askQuestions';

type Focusable =
  | { addListener?: (event: 'focus', cb: () => void) => (() => void) | undefined }
  | null
  | undefined;

export function useAskQuestions({
  enabled = true,
  navigation,
}: { enabled?: boolean; navigation?: Focusable } = {}) {
  const [open, setOpen] = useState<AskQuestion[]>([]);
  const [loaded, setLoaded] = useState(!enabled);
  const [day, setDay] = useState(() => getDateService().today());

  const reload = useCallback(async () => {
    setDay(getDateService().today());
    try {
      setOpen(await fetchAskQuestions());
    } catch (err) {
      // nothing is shown that cannot be read; the way in stays away
      console.warn("[Questions] could not read Gremly's questions:", err);
      setOpen([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || typeof navigation?.addListener !== 'function') return undefined;
    return navigation.addListener('focus', () => void reload());
  }, [enabled, navigation, reload]);

  const askable = useMemo(() => askQuestionsFor(open, day), [open, day]);
  const waiting = useMemo(() => questionsWaiting(askable), [askable]);
  return { askable, waiting, loaded, reload };
}
