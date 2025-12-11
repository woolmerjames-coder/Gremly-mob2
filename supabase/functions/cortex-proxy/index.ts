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

  // --- PHASE 1 CLASSIFICATION (new Mind Drop pipeline) ---
  if (type === 'classify-phase1') {
    const key = OPENAI_API_KEY;
    const j = (data: unknown) =>
      new Response(JSON.stringify({ ok: true, ...data }), {
        headers: { 'Content-Type': 'application/json' },
      });

    const text = body.text || '';
    const hasAttachments = body.hasAttachments || false;
    const heuristicHint = body.heuristicHint || null;

    const phase1Prompt = `You are a classification assistant for Gremly, a productivity app for people with ADHD.

Classify the input into exactly ONE bucket:
- "todo": Actionable task to do once (buy milk, call doctor, submit report)
- "habit": Recurring behavior with frequency (exercise daily, drink water, quit smoking)
- "log": Everything else - thoughts, reflections, ideas, notes

For logs, also provide a subtype:
- "journal": Personal reflections, feelings, gratitude
- "idea": Creative thoughts, brainstorms, "what if" thinking
- "general": Notes, references, information, captures

Context:
- hasAttachments=${hasAttachments} (photos strongly suggest "log")
- Client heuristic suggested: bucket="${heuristicHint?.bucket || 'unknown'}", confidence=${heuristicHint?.confidence || 0}

Return ONLY JSON: { "bucket": "todo"|"habit"|"log", "confidence": 0.0-1.0, "subtype": "journal"|"idea"|"general"|null }`;

    const phase1Messages = [
      { role: 'system', content: phase1Prompt },
      { role: 'user', content: text.substring(0, 500) }, // Limit to 500 chars
    ];

    const t0 = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: phase1Messages,
        temperature: 0.1,
        max_tokens: 100,
        response_format: { type: 'json_object' },
      }),
    });

    const oj = await res.json();
    const latency = Date.now() - t0;

    if (!res.ok) {
      // Fallback to heuristic on API error
      console.log('[Phase1] API error, falling back to heuristic', {
        error: oj.error,
      });
      return j({
        bucket: heuristicHint?.bucket || 'log',
        confidence: 0.5,
        subtype: heuristicHint?.subtypeHint || 'general',
        source: 'heuristic-fallback',
        latency_ms: latency,
      });
    }

    const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.log('[Phase1] Parse error, falling back', { raw: rawContent });
      return j({
        bucket: heuristicHint?.bucket || 'log',
        confidence: 0.5,
        subtype: 'general',
        source: 'parse-fallback',
      });
    }

    // Validate bucket
    const validBuckets = ['todo', 'habit', 'log'];
    let bucket = (parsed.bucket || '').toLowerCase();
    if (!validBuckets.includes(bucket)) bucket = 'log';

    // Validate subtype (only for logs)
    let subtype = null;
    if (bucket === 'log') {
      const validSubtypes = ['journal', 'idea', 'general'];
      subtype = validSubtypes.includes(parsed.subtype) ? parsed.subtype : 'general';
    }

    // Validate confidence
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.7;
    confidence = Math.max(0, Math.min(1, confidence));

    console.log('[Phase1]', {
      bucket,
      subtype,
      confidence,
      latency_ms: latency,
      heuristic_agreed: heuristicHint?.bucket === bucket,
    });

    return j({
      bucket,
      subtype,
      confidence,
      source: 'api',
      latency_ms: latency,
    });
  }

  // --- PHASE 2 ENRICHMENT (smart titles, tags, time estimates) ---
  if (type === 'enrich-phase2') {
    const key = OPENAI_API_KEY;
    const j = (data: unknown, status = 200) =>
      new Response(JSON.stringify({ ok: true, ...data }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    const text = body.text || '';
    const bucket = body.bucket || 'log';
    const subtype = body.subtype || null;
    const currentDate = body.currentDate || new Date().toISOString().split('T')[0];

    const phase2Prompt = `You are enriching items for Gremly, a productivity app for ADHD users.

Given an item classified as "${bucket}"${subtype ? ` (${subtype})` : ''}, generate metadata.

RULES:
1. smart_title: Concise title (max 60 chars)
   - Todos: Start with verb ("Call doctor about prescription")
   - Habits: Describe behavior ("Morning meditation routine")
   - Logs: Summarize key point ("Reflection on career goals")

2. tags: 3-5 lowercase keyword tags, hyphens for spaces, no special chars
   - Avoid generic tags like "note", "thought", "stuff"
   - Include topic tags (#work, #health, #family)

3. time_estimate_minutes (todos only): Use ONLY: 5, 10, 15, 30, 45, 60, 90, 120
   - Return null if unclear or not a todo

4. extracted_date: Parse dates like "tomorrow", "next Friday", "Jan 15"
   - Return ISO format (YYYY-MM-DD) or null
   - Today is ${currentDate}

5. extracted_frequency (habits only): "daily", "weekly", "3x/week", etc.

6. people: Names mentioned (["Sarah", "Dr. Smith", "Mom"])

Return ONLY JSON:
{
  "smart_title": "...",
  "tags": ["tag1", "tag2"],
  "time_estimate_minutes": number|null,
  "extracted_date": "YYYY-MM-DD"|null,
  "extracted_frequency": "..."|null,
  "people": []
}`;

    const phase2Messages = [
      { role: 'system', content: phase2Prompt },
      { role: 'user', content: text.substring(0, 2000) }, // Limit to 2000 chars
    ];

    const t0 = Date.now();

    // 7 second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: phase2Messages,
          temperature: 0.3,
          max_completion_tokens: 500,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const oj = await res.json();
      const latency = Date.now() - t0;

      if (!res.ok) {
        console.log('[Phase2] API error', {
          error: oj.error,
          latency_ms: latency,
        });
        return j({ error: 'enrichment_failed', latency_ms: latency }, 200);
      }

      const rawContent = oj?.choices?.[0]?.message?.content ?? '{}';
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        console.log('[Phase2] Parse error', { raw: rawContent });
        return j({ error: 'parse_failed' }, 200);
      }

      // Validate and normalize tags
      let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
      tags = tags
        .map((t: unknown) =>
          String(t)
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
        )
        .filter((t: string) => t.length >= 2 && t.length <= 30)
        .slice(0, 5); // Max 5 tags

      // Validate time estimate
      let timeEstimate = parsed.time_estimate_minutes;
      if (bucket === 'todo' && timeEstimate !== null) {
        const allowed = [5, 10, 15, 30, 45, 60, 90, 120];
        if (!allowed.includes(timeEstimate)) {
          // Snap to nearest allowed value
          timeEstimate = allowed.reduce((prev, curr) =>
            Math.abs(curr - timeEstimate) < Math.abs(prev - timeEstimate) ? curr : prev,
          );
        }
      } else {
        timeEstimate = null;
      }

      // Validate title
      let smartTitle = parsed.smart_title || '';
      if (smartTitle.length > 60) smartTitle = smartTitle.substring(0, 57) + '...';
      if (smartTitle.length < 3) smartTitle = text.substring(0, 60);

      console.log('[Phase2]', {
        smart_title: smartTitle.substring(0, 30) + '...',
        tags_count: tags.length,
        has_time: timeEstimate !== null,
        latency_ms: latency,
      });

      return j({
        smart_title: smartTitle,
        tags,
        time_estimate_minutes: timeEstimate,
        extracted_date: parsed.extracted_date || null,
        extracted_frequency: parsed.extracted_frequency || null,
        people: Array.isArray(parsed.people) ? parsed.people.slice(0, 10) : [],
        latency_ms: latency,
      });
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = (err as Error).name === 'AbortError';
      console.log('[Phase2]', isTimeout ? 'Timeout' : 'Error', {
        error: String(err),
      });
      return j(
        {
          error: isTimeout ? 'timeout' : 'enrichment_failed',
          latency_ms: Date.now() - t0,
        },
        200,
      );
    }
  }

  return bad(400, 'invalid_type');
});
