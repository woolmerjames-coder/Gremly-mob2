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

function buildBirthdayContext(accountCreatedAt: string | null): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  let context = `\n=== DATE & RELATIONSHIP ===\n`;
  context += `Today is ${todayStr}.\n`;

  if (accountCreatedAt) {
    const birthDate = new Date(accountCreatedAt);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysTogether = Math.floor((today.getTime() - birthDate.getTime()) / msPerDay);

    const birthDateStr = birthDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    context += `You were born on ${birthDateStr} (when this user created their account).\n`;
    context += `You've been companions for ${daysTogether} day${daysTogether === 1 ? '' : 's'}.`;
  }

  return context;
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
    // eslint-disable-next-line no-restricted-syntax -- Server-side code, UTC is intentional for consistency
    const currentDate = body.currentDate || new Date().toISOString().split('T')[0];

    const phase2Prompt = `You are enriching items for Gremly, a productivity app. Your job is to make items SCANNABLE and ORGANIZED.

ITEM TYPE: "${bucket}"${subtype ? ` (${subtype})` : ''}

=== SMART TITLE RULES ===
Create a SHORT, scannable title (3-5 words ideal, max 7 words).
- AGGRESSIVELY remove filler words: "about", "for", "the", "a", "some", "my"
- Keep: core verb + key noun/person
- Remove context that belongs in tags instead

EXAMPLES:
- "Pick up Bella from the walker" → "Pick up Bella"
- "Call mom about weekend plans" → "Call mom" 
- "Buy groceries for dinner" → "Buy groceries"
- "Schedule dentist appointment for next week" → "Schedule dentist"
- "Research best hotels in Kyoto for January trip" → "Research Kyoto hotels"
- "I need to remember to take out the trash tonight" → "Take out trash"

=== TAG RULES ===
Generate 2-4 CATEGORY tags + 1-2 TOPIC tags (max 5 total).

CATEGORY TAGS (2-4): Semantic categories that help with filtering.
- GOOD: errands, family, health, work, home, finance, travel, shopping, self-care, social, appointments, communication
- BAD: call, pickup, buy, groceries (too literal)

TOPIC TAGS (1-2): Specific meaningful nouns from the text.
- GOOD: ballet, dentist, kyoto, passport, taxes (concrete topics)
- BAD: than, expected, more, less, the, a, it, this, some, about, for (stopwords)
- Must be 3-20 chars, no punctuation, clearly meaningful

EXAMPLES:
- "Ballet was more fun than expected" → tags: ["social", "entertainment", "ballet"]
- "Schedule dentist appointment" → tags: ["health", "appointments", "dentist"]
- "Research Kyoto hotels for January" → tags: ["travel", "planning", "kyoto"]

=== PEOPLE RULES ===
Extract proper names as people, NOT as tags.
- "Bella", "Mom", "Dr. Smith", "Dave" → people array
- These should NEVER appear in tags

=== TIME ESTIMATE (todos only) ===
Pick from: 5, 10, 15, 30, 45, 60, 90, 120 minutes
Be realistic. Quick calls = 5-10min. Errands = 15-30min.

=== DATE EXTRACTION ===
Parse dates like "tomorrow", "next Friday", "Jan 15"
- Return ISO format (YYYY-MM-DD) or null
- Today is ${currentDate}

=== FREQUENCY (habits only) ===
"daily", "weekly", "3x/week", etc.

Return ONLY valid JSON:
{
  "smart_title": "...",
  "tags": ["category1", "category2", "topic1"],
  "time_estimate_minutes": number|null,
  "extracted_date": "YYYY-MM-DD"|null,
  "extracted_frequency": "..."|null,
  "people": ["Name1", "Name2"]
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

      // Stopwords to filter out (junk tags)
      const stopwords = new Set([
        'than',
        'expected',
        'more',
        'less',
        'the',
        'a',
        'an',
        'it',
        'this',
        'that',
        'some',
        'about',
        'for',
        'with',
        'from',
        'into',
        'was',
        'were',
        'been',
        'being',
        'have',
        'has',
        'had',
        'having',
        'do',
        'does',
        'did',
        'doing',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'shall',
        'can',
        'need',
        'want',
        'just',
        'very',
        'really',
        'much',
        'too',
        'also',
        'even',
        'still',
        'already',
        'always',
        'never',
        'often',
        'sometimes',
        'now',
        'then',
        'here',
        'there',
        'when',
        'where',
        'why',
        'how',
        'what',
        'which',
        'who',
        'whom',
        'whose',
        'all',
        'each',
        'every',
        'both',
        'few',
        'many',
        'most',
        'other',
        'another',
        'such',
        'only',
        'own',
        'same',
        'thing',
        'things',
        'stuff',
        'way',
        'ways',
        'time',
        'times',
        'day',
        'days',
        'good',
        'great',
        'nice',
        'fun',
        'bad',
        'new',
        'old',
        'first',
        'last',
      ]);

      tags = tags
        .map((t: unknown) =>
          String(t)
            .toLowerCase()
            .replace(/\\s+/g, '-')
            .replace(/[^a-z0-9-]/g, ''),
        )
        .filter((t: string) => t.length >= 3 && t.length <= 30 && !stopwords.has(t))
        .slice(0, 5); // Max 5 tags

      // Filter out people names from tags (BUG 3 fix)
      if (Array.isArray(parsed.people) && parsed.people.length > 0) {
        const peopleNamesLower = parsed.people.map((p: string) =>
          p.toLowerCase().replace(/\\s+/g, '-'),
        );
        tags = tags.filter((t: string) => !peopleNamesLower.includes(t));
      }

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

  // --- ENTITY CHAT (streaming SSE for entity overlays/sweep) ---
  if (type === 'entity-chat') {
    const key = OPENAI_API_KEY;
    const { entity, messages, preset, sweepContext, accountCreatedAt, stream } = body;

    if (!entity || !messages) {
      return bad(400, 'missing_entity_or_messages');
    }

    // Build birthday context
    const birthdayContext = buildBirthdayContext(accountCreatedAt ?? null);

    // Build entity context for prompt
    const entityTypeLabel =
      entity.type === 'todo' ? 'To-Do' : entity.type === 'habit' ? 'Habit' : 'Note';
    let entityDetails = `Type: ${entityTypeLabel}\nTitle: ${entity.title}`;
    if (entity.body) entityDetails += `\nDetails: ${entity.body}`;
    if (entity.tags?.length) entityDetails += `\nTags: ${entity.tags.join(', ')}`;
    if (entity.due_date) entityDetails += `\nDue: ${entity.due_date}`;
    if (entity.frequency) entityDetails += `\nFrequency: ${entity.frequency}`;
    if (entity.time_estimate) entityDetails += `\nTime estimate: ${entity.time_estimate} minutes`;
    if (entity.space_name) entityDetails += `\nSpace: ${entity.space_name}`;
    if (entity.days_since_created !== undefined)
      entityDetails += `\nCreated: ${entity.days_since_created} days ago`;

    // Build sweep context if available
    let sweepDetails = '';
    if (sweepContext) {
      sweepDetails = `\n\n=== SWEEP CONTEXT ===
This item is being reviewed during Evening Sweep.
Times moved: ${sweepContext.times_moved}
Days unscheduled: ${sweepContext.days_unscheduled}
Overdue: ${sweepContext.is_overdue ? 'Yes' : 'No'}`;
    }

    // Build the full system prompt
    const entityChatSystemPrompt = `You are Gremly—an AI-powered thinking partner. You're helping the user think through a specific ${entityTypeLabel.toLowerCase()}.

=== YOUR ROLE ===
- Help them think through this item clearly
- Be warm, practical, and concise
- Give one focused response (50-150 words ideal)
- Don't offer multiple options (causes decision fatigue)
- Match their energy—if they're brief, be brief back

=== ENTITY CONTEXT ===
${entityDetails}${sweepDetails}${birthdayContext}

=== RESPONSE STYLE ===
- Be helpful and direct
- If they're stuck, help unstick them
- If they're exploring, explore with them
- Don't be preachy or lecture-y
- One question max per response`;

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: entityChatSystemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const t0 = Date.now();

    // Non-streaming response
    if (!stream) {
      try {
        const res = await withTimeout(
          fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: fullMessages,
              temperature: 0.7,
              max_completion_tokens: 500,
            }),
          }),
          TIMEOUT_MS,
        );

        if (!res.ok) {
          const errorText = await res.text();
          console.log('[EntityChat] API error:', res.status, errorText);
          return bad(res.status, 'upstream_error', errorText);
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? '';
        const latency_ms = Date.now() - t0;

        console.log('[EntityChat] Response:', {
          contentLength: content.length,
          latency_ms,
          preset,
        });

        return new Response(
          JSON.stringify({
            content,
            saveable: { detected: false },
            latency_ms,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      } catch (e) {
        const isTimeout = (e as Error)?.message === 'timeout';
        console.log('[EntityChat] Error:', isTimeout ? 'timeout' : String(e));
        return bad(isTimeout ? 504 : 500, (e as Error).message || 'error');
      }
    }

    // Streaming response (SSE)
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        let firstChunkLogged = false;

        try {
          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: fullMessages,
              temperature: 0.7,
              max_completion_tokens: 500,
              stream: true,
            }),
          });

          console.log('[EntityChat:Streaming] OpenAI response status:', openaiRes.status);

          if (!openaiRes.ok) {
            const errorText = await openaiRes.text();
            console.log('[EntityChat:Streaming] API error:', openaiRes.status, errorText);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: 'upstream_error' })}\n\n`),
            );
            controller.close();
            return;
          }

          const reader = openaiRes.body?.getReader();
          if (!reader) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: 'no_reader' })}\n\n`),
            );
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;

              if (!firstChunkLogged) {
                console.log('[EntityChat:Streaming] First raw chunk:', trimmed.slice(0, 500));
                firstChunkLogged = true;
              }

              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                  }
                } catch {
                  // Ignore parse errors for individual chunks
                }
              }
            }
          }

          // Send completion message
          const latency_ms = Date.now() - t0;
          console.log('[EntityChat:Streaming] Complete:', {
            contentLength: fullContent.length,
            latency_ms,
            preset,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                full_content: fullContent,
                saveable: { detected: false },
                latency_ms,
              })}\n\n`,
            ),
          );
          controller.close();
        } catch (e) {
          console.log('[EntityChat:Streaming] Error:', String(e));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  return bad(400, 'invalid_type');
});
