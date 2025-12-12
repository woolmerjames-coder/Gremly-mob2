/**
 * useRecentLogs - Hook for fetching recent logs (journals, ideas, notes) and lists
 *
 * Fetches notes from the past N days (default 7) to display in the Your Notes hub.
 * Provides filtered views by log subtype and computed stats.
 *
 * IMPORTANT: This hook filters out unsorted Mind Drop items (catchall/needs_review)
 * and only shows proper logs (journal, idea, general) and lists.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from '../../providers/AuthProvider';
import { probeMembership } from '../config/surfaceProbe';

/** Labels that indicate unsorted Mind Drop items */
const UNSORTED_LABELS = ['catchall', 'needs_review'];

/**
 * Log subtype for display purposes
 * Maps from database subtype to UI-friendly categories
 */
export type LogSubtypeDisplay = 'journal' | 'idea' | 'general';

/**
 * List item structure for notes with embedded lists
 */
export interface LogListItem {
  id: string;
  label: string;
  checked: boolean;
}

/**
 * Individual log item returned by the hook
 */
export interface LogItem {
  id: string;
  title: string;
  body: string;
  logSubtype: LogSubtypeDisplay;
  isList: boolean;
  listItems?: LogListItem[];
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  mood?: string;
}

/**
 * Return type for useRecentLogs hook
 */
export interface UseRecentLogsReturn {
  /** All recent logs */
  logs: LogItem[];
  /** Loading state */
  loading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Manually trigger a reload */
  reload: () => void;

  // Filtered views
  /** Logs with subtype 'journal' */
  journals: LogItem[];
  /** Logs with subtype 'idea' */
  ideas: LogItem[];
  /** Logs with subtype 'general' (everything else) */
  general: LogItem[];
  /** All items that are lists (isList === true) */
  lists: LogItem[];

  // Stats
  /** Total number of logs */
  totalCount: number;
}

/**
 * Map database subtype to display subtype
 * Handles the various subtype values that can exist in the notes table
 *
 * Note: 'catchall' items are filtered out earlier, so this function
 * should not receive catchall subtypes in normal operation.
 */
function mapToLogSubtype(dbSubtype: string | null, tags?: string[]): LogSubtypeDisplay {
  // Check explicit subtype first
  if (dbSubtype === 'journal') return 'journal';
  if (dbSubtype === 'idea') return 'idea';

  // Check tags for hints
  if (tags && Array.isArray(tags)) {
    const tagLower = tags.map((t) => (typeof t === 'string' ? t.toLowerCase() : ''));
    if (tagLower.includes('#journal') || tagLower.includes('journal')) return 'journal';
    if (tagLower.includes('#idea') || tagLower.includes('idea')) return 'idea';
  }

  // Default to general for everything else
  // This includes: everything_else, reference, list, null, etc.
  return 'general';
}

/**
 * Check if a note is an unsorted Mind Drop item
 * These should be filtered out from the Your Notes view
 *
 * An item is unsorted if:
 * - subtype is 'catchall'
 * - labels include 'catchall' or 'needs_review'
 */
function isUnsortedMindDropItem(
  subtype: string | null,
  labels: string[] | null | undefined,
): boolean {
  // Check subtype
  if (subtype === 'catchall') return true;

  // Check labels
  if (labels && Array.isArray(labels)) {
    const labelLower = labels.map((l) => (typeof l === 'string' ? l.toLowerCase() : ''));
    if (UNSORTED_LABELS.some((unsorted) => labelLower.includes(unsorted))) {
      return true;
    }
  }

  return false;
}

/**
 * Parse list items from note body if present
 * Detects markdown-style lists (- item, * item, 1. item)
 *
 * Note: The notes table doesn't have a list_items column - list data
 * is stored in a separate list_items table linked to the lists table.
 * For notes/logs, we parse the body text to detect lists.
 */
function parseListItems(body: string | null): LogListItem[] | undefined {
  if (!body) return undefined;

  // Match lines that look like list items (including checkbox syntax)
  // Supports: - item, * item, • item, 1. item, [ ] item, [x] item
  const listPattern = /^[\s]*(?:[-*•]|\d+[.)]|\[[ xX]\])\s+(.+)$/gm;
  const matches = [...body.matchAll(listPattern)];

  if (matches.length === 0) return undefined;

  return matches.map((match, index) => {
    const line = match[0];
    const label = match[1]?.trim() || '';
    // Detect checked state from [x] or [X] checkbox
    const isChecked = /^\s*\[[xX]\]/.test(line);

    return {
      id: `list-item-${index}`,
      label,
      checked: isChecked,
    };
  });
}

/**
 * Check if note content appears to be a list
 * Detects bullet points, numbered lists, and checkbox syntax
 */
function detectIsList(body: string | null): boolean {
  if (!body) return false;

  // Count list-like lines (including checkbox syntax)
  const listPattern = /^[\s]*(?:[-*•]|\d+[.)]|\[[ xX]\])\s+.+$/gm;
  const matches = body.match(listPattern);

  // Consider it a list if we have at least 2 list items
  // and they make up at least 50% of non-empty lines
  if (matches && matches.length >= 2) {
    const totalLines = body.split('\n').filter((l) => l.trim()).length;
    return matches.length / totalLines >= 0.5;
  }

  return false;
}

/**
 * Parse tags from JSON array stored in database
 */
function parseTags(tagsJson: unknown): string[] | undefined {
  if (!tagsJson) return undefined;
  if (Array.isArray(tagsJson)) {
    return tagsJson.filter((t): t is string => typeof t === 'string');
  }
  return undefined;
}

/**
 * Hook to fetch recent logs from the past N days
 *
 * @param days - Number of days to look back (default: 7)
 * @returns UseRecentLogsReturn with logs, filtered views, and stats
 *
 * @example
 * ```tsx
 * const { logs, journals, ideas, general, loading, totalCount } = useRecentLogs(7);
 * ```
 */
export function useRecentLogs(days: number = 7): UseRecentLogsReturn {
  const { userId } = useAuth();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!userId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Calculate date threshold
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - days);
      const thresholdISO = threshold.toISOString();

      // Query notes table for recent logs
      // Notes table stores journals, ideas, and general notes
      // Filter out archived notes (archived = true means deleted/converted)
      // Also fetch labels to filter out unsorted Mind Drop items
      const { data, error: queryError } = await supabase
        .from('notes')
        .select('id, title, body, subtype, tags, labels, mood, created_at, updated_at')
        .eq('owner_id', userId)
        .gte('created_at', thresholdISO)
        .or('archived.is.null,archived.eq.false')
        .order('created_at', { ascending: false });

      if (queryError) {
        throw new Error(`Failed to fetch logs: ${queryError.message}`);
      }

      // Transform database rows to LogItem
      // Filter out unsorted Mind Drop items (needs_review label)
      // Keep items that are:
      // 1. Proper logs: journal, idea, catchall (log-general)
      // 2. Lists (detected via body parsing)
      const transformedLogs: LogItem[] = (data || [])
        .filter((row) => {
          const labels = parseTags(row.labels);
          const isList = detectIsList(row.body);

          // Always include lists
          if (isList) return true;

          // Filter out unsorted Mind Drop items (has needs_review label)
          if (isUnsortedMindDropItem(row.subtype, labels)) return false;

          // Include proper logs: journal, idea, catchall (log-general)
          if (row.subtype === 'journal' || row.subtype === 'idea' || row.subtype === 'catchall') return true;
          if (labels?.includes('log')) return true;

          // Default: include if no subtype (legacy items)
          return true;
        })
        .map((row) => {
          const tags = parseTags(row.tags);
          const logSubtype = mapToLogSubtype(row.subtype, tags);
          const listItems = parseListItems(row.body);
          const isList = detectIsList(row.body) || (listItems?.length ?? 0) > 0;

          return {
            id: row.id,
            title: row.title || row.body?.split('\n')[0]?.trim().slice(0, 60) || 'Untitled',
            body: row.body || '',
            logSubtype,
            isList,
            listItems,
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
            tags,
            mood: row.mood || undefined,
          };
        });

      setLogs(transformedLogs);

      // Surface membership probe for test mode
      probeMembership('RecentLogs', transformedLogs);
    } catch (err) {
      console.error('[useRecentLogs] fetch error:', err);
      setError(err instanceof Error ? err : new Error('Unknown error fetching logs'));
    } finally {
      setLoading(false);
    }
  }, [userId, days]);

  // Initial fetch
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Filtered views - memoized for performance
  const journals = useMemo(() => logs.filter((log) => log.logSubtype === 'journal'), [logs]);

  const ideas = useMemo(() => logs.filter((log) => log.logSubtype === 'idea'), [logs]);

  // General includes: general logs + lists that aren't journal/idea
  const general = useMemo(
    () =>
      logs.filter(
        (log) =>
          log.logSubtype === 'general' ||
          (log.isList && log.logSubtype !== 'journal' && log.logSubtype !== 'idea'),
      ),
    [logs],
  );

  // All items that are lists
  const lists = useMemo(() => logs.filter((log) => log.isList), [logs]);

  const totalCount = logs.length;

  return {
    logs,
    loading,
    error,
    reload: fetchLogs,
    journals,
    ideas,
    general,
    lists,
    totalCount,
  };
}

export default useRecentLogs;
