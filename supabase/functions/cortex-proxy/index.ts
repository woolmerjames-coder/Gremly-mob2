// supabase/functions/cortex-proxy/index.ts
// Deno (Supabase Edge) — proxy to OpenAI (no keys in client)
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const TIMEOUT_MS = Number(Deno.env.get('CORTEX_TIMEOUT_MS') ?? 12000);
const WINDOW_MS = Number(Deno.env.get('CORTEX_RATE_WINDOW_MS') ?? 60000);
const MAX_HITS = Number(Deno.env.get('CORTEX_RATE_MAX') ?? 30);

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const hits = new Map<string, { t: number; n: number }>();
function allow(ip: string) {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.t > WINDOW_MS) {
    hits.set(ip, { t: now, n: 1 });
    return true;
  }
  if (cur.n >= MAX_HITS) return false;
  cur.n++;
  return true;
}

function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

function bad(status: number, msg: string, detail?: unknown) {
  return new Response(JSON.stringify({ ok: false, error: msg, detail }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return bad(405, 'method_not_allowed');
  if (!OPENAI_API_KEY) return bad(500, 'server_misconfigured');

  const ip = req.headers.get('x-forwarded-for') ?? 'ip';
  if (!allow(ip)) return bad(429, 'rate_limited');

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return bad(400, 'bad_json');
  }

  const type = body?.type as 'chat' | 'complete' | undefined;
  const model = body?.model ?? 'gpt-4o-mini';
  const temperature = typeof body?.temperature === 'number' ? body.temperature : 0.2;
  const max_tokens = typeof body?.max_tokens === 'number' ? body.max_tokens : 400;

  if (type === 'chat') {
    const messages = body?.messages as ChatMessage[] | undefined;
    if (!Array.isArray(messages) || messages.length === 0) return bad(400, 'missing_messages');
    try {
      const res = await withTimeout(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, messages, temperature, max_tokens }),
        }),
        TIMEOUT_MS,
      );
      if (!res.ok) return bad(res.status, 'upstream_error', await res.text());
      const data = await res.json();
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return bad((e as Error)?.message === 'timeout' ? 504 : 500, (e as Error).message || 'error');
    }
  }

  if (type === 'complete') {
    const prompt = body?.prompt as string | undefined;
    if (!prompt) return bad(400, 'missing_prompt');
    try {
      const res = await withTimeout(
        fetch('https://api.openai.com/v1/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, prompt, temperature, max_tokens }),
        }),
        TIMEOUT_MS,
      );
      if (!res.ok) return bad(res.status, 'upstream_error', await res.text());
      const data = await res.json();
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return bad((e as Error)?.message === 'timeout' ? 504 : 500, (e as Error).message || 'error');
    }
  }

  return bad(400, 'invalid_type');
});
