// Phase 10.6: Scheduled learning job
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { learnFromEvents } from '../../../lib/cortex/learn.ts'; // adjust path if needed

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type PrefRow = {
  user_id: string;
  tone?: 'calm' | 'warm' | 'direct';
  routing_keywords?: Record<string, string[]>;
  last_learned_at?: string | null;
};

type EventRow = {
  id: string;
  user_id: string;
  kind: string;
  payload_json: Record<string, any>;
  created_at: string;
};

export async function handler(_req: Request): Promise<Response> {
  // 1) Load users who have prefs rows; fallback to scanning distinct user_ids from events if needed
  const { data: prefsRows, error: prefsErr } = await supabase
    .from('cortex_preferences')
    .select('user_id, tone, routing_keywords, last_learned_at');
  if (prefsErr) return new Response(`prefs error: ${prefsErr.message}`, { status: 500 });

  const updates: Array<{ user_id: string; merged: Partial<PrefRow>; learnedAt: string }> = [];

  for (const row of (prefsRows || []) as PrefRow[]) {
    const since = row.last_learned_at ?? '1970-01-01T00:00:00Z';
    const { data: evs, error: evErr } = await supabase
      .from('events')
      .select('id, user_id, kind, payload_json, created_at')
      .eq('user_id', row.user_id)
      .gte('created_at', since)
      .lte('created_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(500); // safety cap
    if (evErr) continue;
    if (!evs || evs.length === 0) continue;

    const { mergedPrefs, learnedAt } = learnFromEvents(evs as unknown as EventRow[], {
      user_id: row.user_id,
      tone: row.tone,
      routing_keywords: row.routing_keywords || {},
      last_learned_at: row.last_learned_at || null,
    });

    updates.push({ user_id: row.user_id, merged: mergedPrefs, learnedAt });
  }

  // 2) Apply updates (upsert)
  for (const u of updates) {
    const payload = {
      user_id: u.user_id,
      ...u.merged,
      last_learned_at: u.learnedAt,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('cortex_preferences').upsert(payload).select('user_id').single();
  }

  return new Response(JSON.stringify({ updated: updates.length }), { status: 200 });
}

Deno.serve(handler);
