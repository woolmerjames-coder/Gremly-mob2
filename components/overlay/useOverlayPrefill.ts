import { useEffect, useState } from 'react';
import { callClassify, type CallClassifyResult } from '../../lib/cortex/CortexClient';

type SuggestedTag = { name: string; confidence: number; lowConfidence?: boolean };

export function useOverlayPrefill(initialText?: string) {
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const enabled = (process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL ?? '').toLowerCase() === 'on';
    if (!enabled) return;

    const text = initialText ?? '';
    if (!text.trim()) return;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Prefer a dedicated prefill API if available on the cortex module
        // Dynamically require to allow tests to mock or to avoid static errors
        const cortex: any = await import('../../lib/cortex/CortexClient');

        // Try preferred prefillOverlay shape first
        let res: any = undefined;
        if (typeof cortex.prefillOverlay === 'function') {
          res = await cortex.prefillOverlay({ text });
        } else if (typeof cortex.callClassify === 'function') {
          // Fallback: use classify endpoint and attempt to extract title/tags
          const classifyRes: CallClassifyResult = await cortex.callClassify({ text });
          if (classifyRes && (classifyRes as any).ok === true) {
            const classification = (classifyRes as any).classification;
            // classification may have tags: string[] and confidence
            res = {
              title: undefined,
              tags:
                Array.isArray(classification?.tags) && classification.tags.length
                  ? classification.tags.map((t: string) => ({
                      name: t,
                      confidence: classification.confidence ?? 1,
                    }))
                  : [],
              confidence: classification?.confidence ?? null,
            };
          } else {
            // Try to parse JSON from a legacy content field
            const raw =
              (classifyRes as any)?.data?.content ?? (classifyRes as any)?.data?.passthrough;
            if (typeof raw === 'string') {
              try {
                const parsed = JSON.parse(raw);
                res = parsed;
              } catch {
                // ignore
              }
            }
          }
        }

        if (!mounted) return;

        if (!res) {
          setLoading(false);
          return;
        }

        // Expect shape: { title: string, tags: { name, confidence }[], confidence?: number }
        const title = typeof res.title === 'string' && res.title.trim() ? res.title.trim() : null;
        const rawTags: any[] = Array.isArray(res.tags) ? res.tags : [];

        const filtered = rawTags
          .map((t) => {
            if (typeof t === 'string') return { name: t, confidence: 1 };
            const name = typeof t?.name === 'string' ? t.name : String(t ?? '');
            const conf = typeof t?.confidence === 'number' ? t.confidence : 1;
            return { name, confidence: conf };
          })
          .filter((t) => typeof t.confidence === 'number' && t.confidence >= 0.4)
          .map((t) => ({ ...t, lowConfidence: t.confidence < 0.8 }));

        setSuggestedTitle(title);
        setSuggestedTags(filtered);
        setConfidence(typeof res.confidence === 'number' ? res.confidence : null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // We intentionally only run on mount / initialText
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { suggestedTitle, suggestedTags, confidence, loading, error } as const;
}

export default useOverlayPrefill;
