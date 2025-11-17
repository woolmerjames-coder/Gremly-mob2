import { useCallback, useEffect, useRef, useState } from 'react';
import { callClassify, type CallClassifyResult } from '../../lib/cortex/CortexClient';
import { buildFallbackTags } from '../../cortex/openAiEngine';

export type SuggestedTag = { name: string; lowConfidence?: boolean };

/**
 * COPILOT TASK: Generate a short 3-5 word overlay title from user text.
 *
 * Heuristics:
 * - Use first non-empty line if multi-line
 * - Strip common filler prefixes ("Find", "Remember to", "Need to", etc.)
 * - Intelligently extract topic + location for concise titles like "Dinner in Zipolite"
 * - Fall back to first 5 words if topic/location extraction fails
 * - Capitalize first letter
 *
 * Example: "Find somewhere great for dinner tonight in Zipolite"
 *       -> "Dinner in Zipolite"
 */
function deriveShortTitle(text: string): string {
  if (!text || !text.trim()) return '';

  // Use first non-empty line
  const firstLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';

  if (!firstLine) return '';

  // Strip common filler prefixes
  const fillerPatterns = [
    /^find\s+/i,
    /^remember\s+to\s+/i,
    /^remember\s+/i,
    /^need\s+to\s+/i,
    /^i\s+need\s+to\s+/i,
    /^please\s+/i,
    /^don't\s+forget\s+to\s+/i,
    /^don't\s+forget\s+/i,
    /^todo:?\s+/i,
    /^note:?\s+/i,
    /^task:?\s+/i,
  ];

  let cleaned = firstLine;
  for (const pattern of fillerPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // COPILOT TASK: Intelligent topic + location extraction
  // Try to build a concise title like "Dinner in Zipolite" or "Trip to Lisbon"

  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  // Known topic words that should be prioritized
  const topicWords = new Set([
    'dinner',
    'breakfast',
    'lunch',
    'brunch',
    'meal',
    'meeting',
    'call',
    'interview',
    'appointment',
    'trip',
    'flight',
    'vacation',
    'holiday',
    'project',
    'task',
    'assignment',
    'rent',
    'lease',
    'apartment',
    'party',
    'birthday',
    'celebration',
    'event',
    'workout',
    'gym',
    'exercise',
    'doctor',
    'dentist',
    'checkup',
    'haircut',
    'massage',
    'spa',
    'coffee',
    'drinks',
    'beer',
    'wine',
  ]);

  // Stopwords and common words that shouldn't be considered locations
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'from',
    'by',
    'about',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'both',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'can',
    'will',
    'just',
    'should',
    'now',
    'today',
    'tonight',
    'tomorrow',
    'yesterday',
    'next',
    'last',
    'this',
    'that',
    'these',
    'those',
    'somewhere',
    'anywhere',
    'everywhere',
    'great',
    'good',
    'nice',
    'best',
  ]);

  // Prepositions that typically precede locations
  const locationPreps = new Set(['in', 'at', 'to', 'from', 'near', 'around']);

  let topicCandidate: string | null = null;
  let locationCandidate: string | null = null;
  let locationPrep: string = 'in'; // default preposition

  // First pass: find topic
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    if (topicWords.has(word)) {
      topicCandidate = word;
      break;
    }
  }

  // If we didn't find a known topic word, try to find a noun-like word
  // (not a stopword, not too short, appears early in the text)
  if (!topicCandidate) {
    for (let i = 0; i < Math.min(words.length, 4); i++) {
      const word = words[i].toLowerCase();
      if (!stopwords.has(word) && !locationPreps.has(word) && word.length >= 4) {
        topicCandidate = word;
        break;
      }
    }
  }

  // Second pass: find location (capitalized word after a preposition, or any capitalized word)
  for (let i = 1; i < words.length; i++) {
    // Start at 1 to skip first word
    const word = words[i];
    const prevWord = words[i - 1]?.toLowerCase();

    // Check if this word is capitalized (potential location)
    if (word.length > 0 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      const wordLower = word.toLowerCase();

      // Skip if it's a stopword or common word
      if (stopwords.has(wordLower)) continue;

      // Prefer words that come after location prepositions
      if (prevWord && locationPreps.has(prevWord)) {
        locationCandidate = word;
        locationPrep = prevWord;
        break;
      }

      // Otherwise, any capitalized word that's not a topic word is a candidate
      if (!topicWords.has(wordLower) && !locationCandidate) {
        locationCandidate = word;
      }
    }
  }

  // If we found both topic and location, construct the title
  if (topicCandidate && locationCandidate) {
    const capitalizedTopic = topicCandidate.charAt(0).toUpperCase() + topicCandidate.slice(1);
    return `${capitalizedTopic} ${locationPrep} ${locationCandidate}`;
  }

  // If we found a topic but no location, try to make a short phrase with it
  if (topicCandidate) {
    const topicIndex = words.findIndex((w) => w.toLowerCase() === topicCandidate);
    if (topicIndex >= 0) {
      // Take topic word plus 1-3 words around it for context
      const startIdx = Math.max(0, topicIndex - 1);
      const endIdx = Math.min(words.length, topicIndex + 3);
      const shortPhrase = words.slice(startIdx, endIdx).join(' ');
      return shortPhrase.charAt(0).toUpperCase() + shortPhrase.slice(1);
    }
  }

  // Fallback: take first 5 words
  const limitedWords = words.slice(0, 5);

  if (limitedWords.length === 0) {
    // Fallback: use first 5 words of original first line
    const fallbackWords = firstLine
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .slice(0, 5);
    if (fallbackWords.length === 0) return '';
    const fallbackTitle = fallbackWords.join(' ');
    return fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1);
  }

  const title = limitedWords.join(' ');

  // Capitalize first letter, keep rest as-is
  return title.charAt(0).toUpperCase() + title.slice(1);
}

type UseOverlayPrefillMode = 'create' | 'edit' | string;

type UseOverlayPrefillOptions = {
  initialText?: string;
  mode?: UseOverlayPrefillMode;
  getText?: () => string;
  debounceMs?: number;
  onlyWhenEmpty?: boolean;
  /** Skip automatic prefill on mount (e.g., for AI-placed items) */
  skipAutoRun?: boolean;
};

export function useOverlayPrefill(options: UseOverlayPrefillOptions = {}) {
  const {
    initialText = '',
    mode = 'create',
    getText,
    debounceMs = 600,
    onlyWhenEmpty = false,
    skipAutoRun = false,
  } = options;

  const isCreateMode = mode === 'create';

  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastObservedTextRef = useRef<string>(initialText);

  const runPrefill = useCallback(
    async (rawText?: string, opts?: { force?: boolean }): Promise<string | null> => {
      const force = opts?.force ?? false;
      const textSource = rawText ?? getText?.() ?? initialText;
      const text = (textSource ?? '').trim();
      const enabled =
        (process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL ?? '').toLowerCase() === 'on';

      // COPILOT TASK: Debug logging at start of runPrefill
      console.log('[OverlayPrefill] run', {
        mode,
        isCreateMode,
        force,
        enabled,
        onlyWhenEmpty,
        textLen: text.length,
      });

      lastObservedTextRef.current = textSource ?? '';

      if (!enabled || !text) {
        console.log('[OverlayPrefill] disabled or empty text, clearing state');
        requestIdRef.current += 1; // invalidate any in-flight work
        setSuggestedTitle(null);
        setSuggestedTags([]);
        setLoading(false);
        setError(null);
        return null;
      }

      if (onlyWhenEmpty && !force && text.length > 0) {
        console.log('[OverlayPrefill] onlyWhenEmpty && !force && text>0, clearing state');
        requestIdRef.current += 1;
        setSuggestedTitle(null);
        setSuggestedTags([]);
        setLoading(false);
        setError(null);
        return null;
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
            // Extract AI-generated title, use only if non-empty
            const aiTitle =
              typeof classification?.title === 'string' && classification.title.trim().length > 0
                ? classification.title.trim()
                : null;

            res = {
              title: aiTitle,
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
            // Extract AI-generated title, use only if non-empty
            const aiTitle =
              typeof classification?.title === 'string' && classification.title.trim().length > 0
                ? classification.title.trim()
                : null;

            res = {
              title: aiTitle,
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

        if (requestIdRef.current !== currentRequestId) return null;

        if (!res) {
          console.log('[OverlayPrefill] no res from cortex, clearing');
          setSuggestedTitle(null);
          setSuggestedTags([]);
          return null;
        }

        // COPILOT TASK: Use server title if available, otherwise derive from text
        const finalTitle =
          typeof res.title === 'string' && res.title.trim().length > 0
            ? res.title.trim()
            : deriveShortTitle(text);

        const title = finalTitle && finalTitle.trim().length ? finalTitle.trim() : null;

        console.log('[OverlayPrefill] result', {
          title,
          textPreview: text.slice(0, 80),
        });

        // COPILOT TASK: Merge server tags with local fallback tags
        const rawTags: any[] = Array.isArray(res.tags) ? res.tags : [];

        // Extract tag names from server response
        const rawTagNames = rawTags
          .map((t) => {
            if (typeof t === 'string') return t;
            return typeof t?.name === 'string' ? t.name : String(t ?? '');
          })
          .filter((name) => name && name.trim().length > 0);

        // Get local fallback tags based on text content
        const localFallback = buildFallbackTags(text, 'note');

        // Merge both sources (server tags + local fallback)
        const merged = [...rawTagNames, ...localFallback];

        const filtered =
          merged.length > 0
            ? merged
                .map((tagName) => {
                  // If it came from rawTags and has confidence, use it
                  const original = rawTags.find((t) => {
                    if (typeof t === 'string') return t === tagName;
                    return t?.name === tagName;
                  });

                  const confidence =
                    original &&
                    typeof original === 'object' &&
                    typeof original.confidence === 'number'
                      ? original.confidence
                      : 1; // Default confidence for local fallback tags and string tags

                  return { name: String(tagName).trim(), confidence };
                })
                .filter((t) => t.name && typeof t.confidence === 'number' && t.confidence >= 0.2)
                .filter((t, index, arr) => {
                  // Deduplicate by name (keep first occurrence)
                  return arr.findIndex((other) => other.name === t.name) === index;
                })
                .map((t) => ({ name: t.name, lowConfidence: t.confidence < 0.8 }))
            : [];

        // COPILOT TASK: Debug log to inspect tag pipeline
        console.log('[OverlayPrefill] tags debug', {
          rawTags,
          rawTagNames,
          localFallback,
          merged,
          filtered,
        });

        setSuggestedTitle(title);
        setSuggestedTags(filtered);

        return title;
      } catch (e: any) {
        if (requestIdRef.current !== currentRequestId) return null;
        setError(e?.message ?? String(e));
        setSuggestedTitle(null);
        setSuggestedTags([]);
        return null;
      } finally {
        if (requestIdRef.current === currentRequestId) setLoading(false);
      }
    },
    [getText, initialText, isCreateMode, mode, onlyWhenEmpty],
  );

  // Auto-run on mount (unless skipAutoRun is true)
  useEffect(() => {
    if (!isCreateMode) return;
    if (skipAutoRun) return;
    runPrefill(initialText || getText?.());
  }, [getText, initialText, isCreateMode, runPrefill, skipAutoRun]);

  // Auto-run on text changes (unless skipAutoRun is true)
  useEffect(() => {
    if (!isCreateMode) return;
    if (!getText) return;
    if (skipAutoRun) return;

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
  }, [debounceMs, getText, isCreateMode, runPrefill, skipAutoRun]);

  const refresh = useCallback(
    () => runPrefill(getText?.(), { force: true }),
    [getText, runPrefill],
  );

  return { suggestedTitle, suggestedTags, loading, error, refresh } as const;
}

export default useOverlayPrefill;
