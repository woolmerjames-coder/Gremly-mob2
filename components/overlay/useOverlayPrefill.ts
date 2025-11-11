import { useCallback, useEffect, useRef, useState } from 'react';
import { callClassify, type CallClassifyResult } from '../../lib/cortex/CortexClient';

export type SuggestedTag = { name: string; lowConfidence?: boolean };

type UseOverlayPrefillMode = 'create' | 'edit' | string;

type UseOverlayPrefillOptions = {
  initialText?: string;
  mode?: UseOverlayPrefillMode;
  getText?: () => string;
  debounceMs?: number;
};

export function useOverlayPrefill(options: UseOverlayPrefillOptions = {}) {
  const { initialText = '', mode = 'create', getText, debounceMs = 600 } = options;

  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastObservedTextRef = useRef<string>(initialText);

  const runPrefill = useCallback(
    async (rawText?: string) => {
      const enabled =
        (process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL ?? '').toLowerCase() === 'on';
      const textSource = rawText ?? getText?.() ?? initialText;
      const text = (textSource ?? '').trim();

      lastObservedTextRef.current = textSource ?? '';

      if (!enabled || !text) {
        requestIdRef.current += 1; // invalidate any in-flight work
        setSuggestedTitle(null);
        setSuggestedTags([]);
        setLoading(false);
        return;
      }

      const currentRequestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const cortex: any = await import('../../lib/cortex/CortexClient');

        let res: any = undefined;
        if (typeof cortex.prefillOverlay === 'function') {
          res = await cortex.prefillOverlay({ text, mode });
        } else if (typeof cortex.callClassify === 'function') {
          const classifyRes: CallClassifyResult = await cortex.callClassify({ text });
          if (classifyRes && (classifyRes as any).ok === true) {
            const classification = (classifyRes as any).classification;
            res = {
              title: classification?.title,
              tags:
                Array.isArray(classification?.tags) && classification.tags.length
                  ? classification.tags.map((t: string) => ({
                      name: t,
                      confidence: classification.confidence ?? 1,
                    }))
                  : [],
            };
          } else {
            const raw =
              (classifyRes as any)?.data?.content ?? (classifyRes as any)?.data?.passthrough;
            if (typeof raw === 'string') {
              try {
                res = JSON.parse(raw);
              } catch {
                res = undefined;
              }
            }
          }
        } else if (typeof callClassify === 'function') {
          const classifyRes: CallClassifyResult = await callClassify({ text });
          if (classifyRes && (classifyRes as any).ok === true) {
            const classification = (classifyRes as any).classification;
            res = {
              title: classification?.title,
              tags:
                Array.isArray(classification?.tags) && classification.tags.length
                  ? classification.tags.map((t: string) => ({
                      name: t,
                      confidence: classification.confidence ?? 1,
                    }))
                  : [],
            };
          }
        }

        if (requestIdRef.current !== currentRequestId) return;

        if (!res) {
          setSuggestedTitle(null);
          setSuggestedTags([]);
          return;
        }

        const title = typeof res.title === 'string' && res.title.trim() ? res.title.trim() : null;
        const rawTags: any[] = Array.isArray(res.tags) ? res.tags : [];

        const filtered = rawTags
          .map((t) => {
            if (typeof t === 'string') {
              return { name: t, confidence: 1 };
            }
            const name = typeof t?.name === 'string' ? t.name : String(t ?? '');
            const confidence = typeof t?.confidence === 'number' ? t.confidence : 1;
            return { name, confidence };
          })
          .filter((t) => t.name && typeof t.confidence === 'number' && t.confidence >= 0.4)
          .map((t) => ({ name: t.name.trim(), lowConfidence: t.confidence < 0.8 }));

        setSuggestedTitle(title);
        setSuggestedTags(filtered);
      } catch (e: any) {
        if (requestIdRef.current !== currentRequestId) return;
        setError(e?.message ?? String(e));
        setSuggestedTitle(null);
        setSuggestedTags([]);
      } finally {
        if (requestIdRef.current === currentRequestId) setLoading(false);
      }
    },
    [getText, initialText, mode],
  );

  useEffect(() => {
    runPrefill(initialText || getText?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!getText) return;

    let isMounted = true;
    const pollInterval = setInterval(() => {
      if (!isMounted) return;
      const current = getText() ?? '';
      if (current === lastObservedTextRef.current) return;
      lastObservedTextRef.current = current;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => runPrefill(current), debounceMs);
    }, 200);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [debounceMs, getText, runPrefill]);

  const refresh = useCallback(() => runPrefill(getText?.()), [getText, runPrefill]);

  return { suggestedTitle, suggestedTags, loading, error, refresh } as const;
}

export default useOverlayPrefill;
