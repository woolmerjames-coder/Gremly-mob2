import { useGremlyStore } from '../store/useGremlyStore';
import { env } from '../env';
import { getDateService } from '../date';
import { buildWeeklySummaryPayload } from './buildWeeklySummaryPayload';
import { buildTrendContext } from './buildTrendContext';
import type { WeeklySummary, WeeklySummaryContent } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateWeeklySummaryResult {
  success: boolean;
  summary?: WeeklySummary;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function generateWeeklySummary(): Promise<GenerateWeeklySummaryResult> {
  try {
    // 1. Build data payload from store
    const payload = buildWeeklySummaryPayload();
    if (!payload) {
      console.warn('[WeeklySummary] Skipped — store not initialized or no user');
      return { success: false, error: 'Not initialized' };
    }

    // 2. Build trend context from prior summaries (may be null for week 1)
    const trendContext = buildTrendContext();

    // 3. Call the Cortex Worker
    const cortexUrl = env.cortexUrl;
    if (!cortexUrl) {
      console.error('[WeeklySummary] Missing CORTEX_URL');
      return { success: false, error: 'Cortex URL not configured' };
    }

    console.log('[WeeklySummary] Calling Worker...', {
      hasTrendContext: !!trendContext,
      todosCompleted: payload.stats.todosCompleted,
      habitsTracked: Object.keys(payload.stats.habitsTracked).length,
    });

    const response = await fetch(cortexUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'weekly-summary',
        payload,
        trendContext,
      }),
    });

    // 4. Parse response
    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error('[WeeklySummary] Worker error:', response.status, errText);
      return { success: false, error: `Worker returned ${response.status}` };
    }

    const result = await response.json();

    if (result.error) {
      console.error('[WeeklySummary] Worker returned error:', result.error, result.detail);
      return { success: false, error: result.error };
    }

    const parsedContent = result as WeeklySummaryContent;

    // Validate minimum expected shape
    if (!parsedContent.weeklyCommentary || !parsedContent.highlightMoment) {
      console.error('[WeeklySummary] Invalid content shape from Worker');
      return { success: false, error: 'Invalid response shape' };
    }

    // 5. Compute week boundaries
    const ds = getDateService();
    const today = ds.getCurrentDate();
    const date = ds.fromDateString(today);
    if (!date) {
      return { success: false, error: 'Date service error' };
    }
    const dayOfWeek = date.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = ds.addDays(today, mondayOffset);
    const weekEnd = ds.addDays(weekStart, 6);

    // 6. Save to store (persists to Supabase via saveWeeklySummary)
    const savedSummary = await useGremlyStore.getState().saveWeeklySummary({
      user_id: payload.userId,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      generated_at: new Date().toISOString(),
      content: parsedContent,
      stats_snapshot: payload.stats as unknown as Record<string, unknown>,
      trend_context: trendContext as unknown as Record<string, unknown> | null,
      key_themes: parsedContent.keyThemes ?? [],
      cleanup_actions: [],
      viewed: false,
      viewed_at: null,
      completed_flow: false,
      banner_dismissed: false,
    });

    console.log('[WeeklySummary] ✅ Generated and saved:', {
      id: savedSummary.id,
      weekStart,
      weekEnd,
      themes: parsedContent.keyThemes?.length ?? 0,
      insights: parsedContent.insights?.length ?? 0,
      mood: parsedContent.mood,
    });

    // 7. Return success
    return { success: true, summary: savedSummary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[WeeklySummary] Generation failed:', message);
    return { success: false, error: message };
  }
}
