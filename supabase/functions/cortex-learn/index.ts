// Phase 10.6: Scheduled learning job
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { learnFromEvents } from '../../../lib/cortex/learn.ts'; // adjust path if needed

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type PrefRow = {
  owner_id: string;
  tone?: 'calm' | 'warm' | 'direct';
  routing_keywords?: Record<string, string[]>;
  last_learned_at?: string | null;
};

type EventRow = {
  id: string;
  owner_id: string;
  kind: string;
  payload_json: Record<string, any>;
  created_at: string;
};

export async function handler(_req: Request): Promise<Response> {
  // 1) Load users who have prefs rows; fallback to scanning distinct owner_ids from events if needed
  const { data: prefsRows, error: prefsErr } = await supabase
    .from('cortex_preferences')
    .select('owner_id, tone, routing_keywords, last_learned_at');
  if (prefsErr) return new Response(`prefs error: ${prefsErr.message}`, { status: 500 });

  const updates: Array<{ owner_id: string; merged: Partial<PrefRow>; learnedAt: string }> = [];

  for (const row of (prefsRows || []) as PrefRow[]) {
    const since = row.last_learned_at ?? '1970-01-01T00:00:00Z';
    const { data: evs, error: evErr } = await supabase
      .from('events')
      .select('id, owner_id, kind, payload_json, created_at')
      .eq('owner_id', row.owner_id)
      .gte('created_at', since)
      .lte('created_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(500); // safety cap
    if (evErr) continue;
    if (!evs || evs.length === 0) continue;

    // learnFromEvents expects user_id in its in-memory types
    const eventsForLearn = (evs as unknown as EventRow[]).map((e) => ({
      ...e,
      user_id: e.owner_id,
    }));

    const { mergedPrefs, learnedAt } = learnFromEvents(eventsForLearn, {
      user_id: row.owner_id,
      tone: row.tone,
      routing_keywords: row.routing_keywords || {},
      last_learned_at: row.last_learned_at || null,
    });

    updates.push({ owner_id: row.owner_id, merged: mergedPrefs, learnedAt });
  }

  // 2) Apply updates (upsert)
  for (const u of updates) {
    const payload = {
      owner_id: u.owner_id,
      ...u.merged,
      last_learned_at: u.learnedAt,
      updated_at: new Date().toISOString(),
    };
    // mergedPrefs may contain user_id from learn.ts types — remove before DB write
    delete (payload as any).user_id;
    await supabase.from('cortex_preferences').upsert(payload).select('owner_id').single();
  }

  return new Response(JSON.stringify({ updated: updates.length }), { status: 200 });
}

Deno.serve(handler);
