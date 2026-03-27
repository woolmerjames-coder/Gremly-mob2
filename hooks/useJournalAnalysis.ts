/**
 * useJournalAnalysis - Hook for journal analysis with caching + weekly cooldown
 *
 * Features:
 * - Calls Cortex journal-analyze endpoint
 * - Caches result in AsyncStorage (survives app restart)
 * - Enforces 7-day cooldown between analyses
 * - Shows cached result when on cooldown with "next available" date
 * - Loads cached result on mount (instant display)
 *
 * Hub V2 (Feb 2026)
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callJournalAnalyze } from '../lib/cortex/CortexClient';
import { nowTimestamp, getDateService } from '../lib/date/DateService';
import type { JournalAnalysisResult, JournalAnalyzeEntry } from '../lib/cortex/CortexClient';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface JournalAnalysisState {
  /** The analysis result (from cache or fresh) */
  analysis: JournalAnalysisResult | null;
  /** Number of entries that were analyzed */
  entryCount: number;
  /** Whether an analysis is currently running */
  loading: boolean;
  /** Error message if the last attempt failed */
  error: string | null;
  /** Whether the user is on cooldown (can't run a new analysis) */
  onCooldown: boolean;
  /** When the next analysis will be available (ISO string) */
  nextAvailableAt: string | null;
  /** Human-readable label like "Available Feb 15" */
  nextAvailableLabel: string | null;
  /** Trigger a new analysis (no-op if on cooldown) */
  analyze: (entries: JournalAnalyzeEntry[], timezone?: string) => Promise<void>;
}

interface CachedAnalysis {
  analysis: JournalAnalysisResult;
  entryCount: number;
  analyzedAt: string; // ISO timestamp
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = '@gremly/journal-analysis-cache';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatNextAvailable(date: Date): string {
  return getDateService().formatForChip(getDateService().toLocalDate(date));
}

async function loadCachedAnalysis(): Promise<CachedAnalysis | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate shape
    if (parsed?.analysis && parsed?.analyzedAt) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function saveCachedAnalysis(data: CachedAnalysis): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    if (__DEV__) console.warn('[JournalAnalysis] Failed to save cache:', err);
  }
}

function getCooldownState(analyzedAt: string): {
  onCooldown: boolean;
  nextAvailableAt: string | null;
  nextAvailableLabel: string | null;
} {
  const analyzedTime = new Date(analyzedAt).getTime();
  const nextTime = analyzedTime + COOLDOWN_MS;
  const now = getDateService().now().getTime();

  if (now >= nextTime) {
    return { onCooldown: false, nextAvailableAt: null, nextAvailableLabel: null };
  }

  const nextDate = new Date(nextTime);
  return {
    onCooldown: true,
    nextAvailableAt: nextDate.toISOString(),
    nextAvailableLabel: `Available ${formatNextAvailable(nextDate)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════

export function useJournalAnalysis(): JournalAnalysisState {
  const [analysis, setAnalysis] = useState<JournalAnalysisResult | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onCooldown, setOnCooldown] = useState(false);
  const [nextAvailableAt, setNextAvailableAt] = useState<string | null>(null);
  const [nextAvailableLabel, setNextAvailableLabel] = useState<string | null>(null);

  // Load cached analysis on mount
  useEffect(() => {
    let mounted = true;

    (async () => {
      const cached = await loadCachedAnalysis();
      if (!mounted) return;

      if (cached) {
        setAnalysis(cached.analysis);
        setEntryCount(cached.entryCount);

        const cooldown = getCooldownState(cached.analyzedAt);
        setOnCooldown(cooldown.onCooldown);
        setNextAvailableAt(cooldown.nextAvailableAt);
        setNextAvailableLabel(cooldown.nextAvailableLabel);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const analyze = useCallback(
    async (entries: JournalAnalyzeEntry[], timezone = 'UTC') => {
      // Don't run if on cooldown
      if (onCooldown) {
        if (__DEV__) console.log('[JournalAnalysis] On cooldown, skipping');
        return;
      }

      // Don't run if already loading
      if (loading) return;

      // Need at least 1 entry
      if (entries.length === 0) {
        setError('No journal entries to analyze');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await callJournalAnalyze(entries, timezone);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        const { analysis: newAnalysis, entry_count } = result.data;

        // Update state
        setAnalysis(newAnalysis);
        setEntryCount(entry_count);

        // Cache the result
        const now = nowTimestamp();
        await saveCachedAnalysis({
          analysis: newAnalysis,
          entryCount: entry_count,
          analyzedAt: now,
        });

        // Set cooldown
        const cooldown = getCooldownState(now);
        setOnCooldown(cooldown.onCooldown);
        setNextAvailableAt(cooldown.nextAvailableAt);
        setNextAvailableLabel(cooldown.nextAvailableLabel);
      } catch (err: any) {
        setError(err?.message || 'Analysis failed');
      } finally {
        setLoading(false);
      }
    },
    [onCooldown, loading],
  );

  return {
    analysis,
    entryCount,
    loading,
    error,
    onCooldown,
    nextAvailableAt,
    nextAvailableLabel,
    analyze,
  };
}
