// Deno Deploy / Supabase Edge Function
// Endpoint: POST /functions/v1/cortex-logs-collector
// Appends a CSV line to a per-day file in a public Storage bucket (analytics)

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

const HEADERS =
  'ts,user_id_hash,text_hash,surface,engine,model_version,intent,confidence,mode,decision,latency_ms,created_todos,created_notes,created_habits\n';

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const bucket = Deno.env.get('LOGS_BUCKET') || 'analytics';

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as Partial<LogRow>;
    // Minimal validation
    if (!body || !body.ts || !body.user_id_hash || !body.text_hash || !body.surface) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Compute daily key
    const day = (body.ts || new Date().toISOString()).slice(0, 10);
    const objectKey = `catchall-${day}.csv`;

    // Read existing CSV (if any)
    const existing = await supabase.storage.from(bucket).download(objectKey);
    let existingText = '';
    if (existing.data) {
      existingText = await existing.data.text();
    } else {
      // Ensure header on first write
      existingText = HEADERS;
    }

    const line = toCsvLine(body as LogRow);
    const next = existingText + line;

    const upload = await supabase.storage
      .from(bucket)
      .upload(objectKey, new Blob([next], { type: 'text/csv' }), {
        cacheControl: '0',
        upsert: true,
        contentType: 'text/csv',
      });

    if (upload.error) {
      return new Response(JSON.stringify({ ok: false, error: upload.error.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
