// Endpoint: POST /functions/v1/cortex-logs-collector
// Appends a CSV line to a per-day file in a public Storage bucket (analytics).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type LogRow = {
  ts: string; // ISO
  user_id_hash: string;
  text_hash: string;
  surface: 'catchall' | 'space_chat';
  engine: 'LLM' | 'HEURISTIC' | 'DISABLED';
  model_version?: string;
  intent: string;
  confidence: number;
  mode: 'auto' | 'ask' | 'keep' | 'unsorted';
  decision: string;
  latency_ms?: number;
  created_todos?: number;
  created_notes?: number;
  created_habits?: number;
};

const CSV_HEADER =
  'ts,user_id_hash,text_hash,surface,engine,model_version,intent,confidence,mode,decision,latency_ms,created_todos,created_notes,created_habits\n';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'content-type': 'application/json',
};

function toCsvLine(r: LogRow): string {
  const safe = (v: any) =>
    v === undefined || v === null
      ? ''
      : String(v).replaceAll('"', '""').replaceAll('\n', ' ').trim();
  return (
    [
      safe(r.ts),
      safe(r.user_id_hash),
      safe(r.text_hash),
      safe(r.surface),
      safe(r.engine),
      safe(r.model_version ?? ''),
      safe(r.intent),
      safe(r.confidence),
      safe(r.mode),
      safe(r.decision),
      safe(r.latency_ms ?? ''),
      safe(r.created_todos ?? ''),
      safe(r.created_notes ?? ''),
      safe(r.created_habits ?? ''),
    ].join(',') + '\n'
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL'); // provided by platform
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY'); // CHANGED: non-reserved secret name
    const bucket = Deno.env.get('LOGS_BUCKET') || 'analytics';

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_server_env' }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as Partial<LogRow>;
    if (!body?.ts || !body?.user_id_hash || !body?.text_hash || !body?.surface) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const day = body.ts.slice(0, 10); // YYYY-MM-DD
    const objectKey = `catchall-${day}.csv`;

    // Read existing CSV (if any)
    const existing = await supabase.storage.from(bucket).download(objectKey);
    let csv = '';
    if (existing.data) {
      csv = await existing.data.text();
    } else {
      // First time for the day — include header
      csv = CSV_HEADER;
    }

    const line = toCsvLine(body as LogRow);
    const next = csv + line;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(objectKey, new Blob([next], { type: 'text/csv' }), {
        cacheControl: '0',
        upsert: true,
        contentType: 'text/csv',
      });

    if (uploadError) {
      return new Response(JSON.stringify({ ok: false, error: uploadError.message }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
