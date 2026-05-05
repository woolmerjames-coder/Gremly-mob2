/**
 * Drop Assignment Backfill (one-shot)
 *
 * Trigger: app/drops.assignment-backfill
 * Required event data: { user_id: string }
 * Optional event data: { batch_size?: number }  -- default 20
 *
 * Classifies every existing drop for a single user against their current
 * Worlds/Chapters/Life Contexts graph, using batched gpt-4.1-mini calls, and
 * upserts the results into drop_world_links, drop_chapter_links, and
 * drop_context_links.
 *
 * Each batch is its own Inngest step so the function is resumable -- if a
 * batch fails, Inngest stops at that step. retries: 0 means one attempt only.
 * Re-trigger manually on a clean re-run; upserts are idempotent via composite
 * PK so re-runs are self-healing.
 *
 * gpt-4.1-mini pricing: $0.40/M input tokens, $1.60/M output tokens.
 */

import { Inngest } from 'inngest';
import { createClient } from '@supabase/supabase-js';

// -- gpt-4.1-mini pricing constants ------------------------------------------
const COST_PER_M_INPUT_USD = 0.4; // USD per million input tokens
const COST_PER_M_OUTPUT_USD = 1.6; // USD per million output tokens

const DEFAULT_BATCH_SIZE = 20;
const MAX_OUTPUT_TOKENS = 8000;

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_M_INPUT_USD +
    (outputTokens / 1_000_000) * COST_PER_M_OUTPUT_USD
  );
}

// -- Types -------------------------------------------------------------------

interface BackfillDrop {
  drop_id: string;
  drop_type: 'note' | 'todo' | 'habit';
  text: string; // truncated to 1000 chars
  smart_title?: string;
  subtype?: string;
  effective_date: string; // YYYY-MM-DD
  tags?: string[];
}

interface GraphWorld {
  id: string;
  name: string;
  description: string;
}

interface GraphChapter {
  id: string;
  title: string;
  description: string;
  primary_world_id: string;
  phase: string;
  start_date: string | null;
  end_date: string | null;
}

interface GraphLifeContext {
  id: string;
  name: string;
  kind: string;
  description: string;
}

interface ActiveGraph {
  worlds: GraphWorld[];
  chapters: GraphChapter[];
  lifeContexts: GraphLifeContext[];
}

interface ClassifierResultItem {
  drop_id: string;
  world_links: Array<{ world_id: string; relevance_score: number }>;
  chapter_links: Array<{ chapter_id: string; relevance_score: number }>;
  context_links: Array<{ context_id: string; relevance_score: number }>;
  reason: string;
}

interface ClassifierResponse {
  results: ClassifierResultItem[];
}

interface BatchSummary {
  batch_index: number;
  drops_in_batch: number;
  world_links_written: number;
  chapter_links_written: number;
  context_links_written: number;
  discarded_links: number;
  unclassified_drop_count: number;
  input_tokens: number;
  output_tokens: number;
}

// -- Helpers -----------------------------------------------------------------

function isFiniteScore(s: unknown): s is number {
  return typeof s === 'number' && isFinite(s) && s >= 0 && s <= 1;
}

function toIsoDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (isNaN(d.getTime())) return fallback;
  return d.toISOString().slice(0, 10);
}

function parseTags(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const strs = raw.filter((t): t is string => typeof t === 'string');
    return strs.length > 0 ? strs : undefined;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const strs = parsed.filter((t): t is string => typeof t === 'string');
        return strs.length > 0 ? strs : undefined;
      }
    } catch {
      // not JSON -- ignore
    }
  }
  return undefined;
}

function makeSupabaseHeaders(env: any): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// -- System prompt (rules section matches 3.2 verbatim; output paragraph adapted for batch) -------

const SYSTEM_PROMPT = `You assign Gremly drops to the user's existing graph of Worlds, Chapters, and Life Contexts.

A World is a long-lived identity area in the user's life, a domain where the user reflects, plans, builds habits, or engages over time.

A Chapter is a bounded arc within one or more Worlds, with a defined start and sometimes an end.

A Life Context is a structural part of the user's life that constrains or shapes how they spend time, but is not itself a growth area.

Your only job is to decide which of the user's existing Worlds, Chapters, and Life Contexts each drop belongs to, and with what confidence. You never propose new entities. You assign only to entities present in the provided lists.

A drop may belong to zero, one, or many Worlds. The same applies to Chapters and Life Contexts. Multi-label is normal and expected.

A drop belongs to a World when its content is semantically a signal about that World's identity area.

A drop belongs to a Chapter when its content is semantically about the chapter's subject matter. If the chapter has a start_date and end_date, weigh whether the drop's effective_date sits within or near that window. Closed chapters may still receive drops when the drop is retroactively about the chapter's arc.

A drop belongs to a Life Context when its content is a signal that occurred within that constraint, rather than being an expression of growth inside it.

Relevance score is a continuous value between 0 and 1 representing your confidence that the drop is genuinely about that entity. Use higher scores for clear, primary relevance and lower scores for tangential relevance. Do not emit a link at all when your confidence is below 0.3.

Empty arrays are valid output. When a drop does not fit any existing entity, produce an output with all link arrays empty. Do not force a drop into the nearest available entity.

You never propose new Worlds, Chapters, or Life Contexts. You assign only to entities that appear in the provided lists.

Provide one short sentence describing your overall judgement for each specific drop.

You receive multiple drops at once inside the drops: block of the user message. Return a single JSON object with a top-level field called results. The results field is an array containing one object per input drop, matched to the drop by its drop_id. Each result object has four fields. drop_id is the string drop id from the input. world_links is an array of objects, each with a world_id string and a relevance_score number between 0 and 1. chapter_links is an array of objects, each with a chapter_id string and a relevance_score number between 0 and 1. context_links is an array of objects, each with a context_id string and a relevance_score number between 0 and 1. reason is a string containing your one-sentence judgement for that specific drop. Return only the JSON object with no surrounding text or markdown fences.`;

function buildUserPrompt(graph: ActiveGraph, batch: BackfillDrop[]): string {
  return [
    'active_worlds:',
    JSON.stringify(
      graph.worlds.map((w) => ({ id: w.id, name: w.name, description: w.description })),
    ),
    '',
    'active_chapters:',
    JSON.stringify(
      graph.chapters.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        primary_world_id: c.primary_world_id,
        phase: c.phase,
        start_date: c.start_date,
        end_date: c.end_date,
      })),
    ),
    '',
    'active_life_contexts:',
    JSON.stringify(
      graph.lifeContexts.map((lc) => ({
        id: lc.id,
        name: lc.name,
        kind: lc.kind,
        description: lc.description,
      })),
    ),
    '',
    'drops:',
    JSON.stringify(batch),
  ].join('\n');
}

// -- Factory export ----------------------------------------------------------

export function createDropAssignmentBackfill(inngest: Inngest<{ id: 'gremly' }>) {
  return inngest.createFunction(
    {
      id: 'drop-assignment-backfill',
      name: 'Drop Assignment Backfill (one-shot)',
      retries: 0,
    },
    { event: 'app/drops.assignment-backfill' },
    async ({ event, step, env }: { event: any; step: any; env: any }) => {
      const userId: string = event.data?.user_id;
      if (!userId) throw new Error('user_id is required in event.data');

      const batchSize: number = event.data?.batch_size ?? DEFAULT_BATCH_SIZE;

      // ── Step 1: capture backfill start timestamp ─────────────────
      const backfillStart: string = await step.run('resolve-start', async () => {
        return new Date().toISOString();
      });

      // ── Step 2: load active graph ────────────────────────────────
      const graph: ActiveGraph = await step.run('load-graph', async () => {
        const headers = makeSupabaseHeaders(env);

        const [worldsRes, chaptersRes, ctxRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/worlds?owner_id=eq.${userId}&phase=in.(candidate,active,evolving)&select=id,name,description`,
            { headers },
          ),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/chapters?owner_id=eq.${userId}&phase=in.(suggested,upcoming,active,closed)&select=id,title,description,primary_world_id,phase,start_date,end_date`,
            { headers },
          ),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/life_contexts?owner_id=eq.${userId}&active=is.true&select=id,name,kind,description`,
            { headers },
          ),
        ]);

        if (!worldsRes.ok) throw new Error(`worlds fetch failed: ${worldsRes.status}`);
        if (!chaptersRes.ok) throw new Error(`chapters fetch failed: ${chaptersRes.status}`);
        if (!ctxRes.ok) throw new Error(`life_contexts fetch failed: ${ctxRes.status}`);

        const [worlds, chapters, lifeContexts] = await Promise.all([
          worldsRes.json() as Promise<GraphWorld[]>,
          chaptersRes.json() as Promise<GraphChapter[]>,
          ctxRes.json() as Promise<GraphLifeContext[]>,
        ]);

        if (worlds.length === 0 && chapters.length === 0 && lifeContexts.length === 0) {
          throw new Error(
            'empty_graph: no active Worlds, Chapters, or Life Contexts found for this user. ' +
              'Run the Worlds bootstrap first (app/worlds.bootstrap) before backfilling drop assignments.',
          );
        }

        return { worlds, chapters, lifeContexts };
      });

      // ── Step 3: list all eligible drops created before backfillStart ──
      const allDrops: BackfillDrop[] = await step.run('list-drops', async () => {
        const headers = makeSupabaseHeaders(env);
        const cutoff = encodeURIComponent(backfillStart);

        const [notesRes, todosRes, habitsRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/notes?owner_id=eq.${userId}&created_at=lt.${cutoff}&archived=is.false&external_source=is.null&select=id,body,title,subtype,date,created_at,tags`,
            { headers },
          ),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/todos?owner_id=eq.${userId}&created_at=lt.${cutoff}&archived=is.false&select=id,body,notes,name,title,subtype,created_at,tags`,
            { headers },
          ),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/habits?owner_id=eq.${userId}&created_at=lt.${cutoff}&archived=is.false&select=id,notes,title,name,subtype,created_at,tags`,
            { headers },
          ),
        ]);

        if (!notesRes.ok) throw new Error(`notes fetch failed: ${notesRes.status}`);
        if (!todosRes.ok) throw new Error(`todos fetch failed: ${todosRes.status}`);
        if (!habitsRes.ok) throw new Error(`habits fetch failed: ${habitsRes.status}`);

        const [notesRaw, todosRaw, habitsRaw] = await Promise.all([
          notesRes.json() as Promise<any[]>,
          todosRes.json() as Promise<any[]>,
          habitsRes.json() as Promise<any[]>,
        ]);

        const drops: BackfillDrop[] = [];

        for (const n of notesRaw) {
          const text = (n.body ?? '').toString().substring(0, 1000);
          if (!text.trim()) continue;
          const effectiveDate = toIsoDate(n.date ?? n.created_at, n.created_at?.slice(0, 10) ?? '');
          const d: BackfillDrop = {
            drop_id: n.id as string,
            drop_type: 'note',
            text,
            effective_date: effectiveDate,
          };
          if (n.title) d.smart_title = (n.title as string).substring(0, 120);
          if (n.subtype) d.subtype = n.subtype as string;
          const tags = parseTags(n.tags);
          if (tags) d.tags = tags;
          drops.push(d);
        }

        for (const t of todosRaw) {
          const rawText = t.body ?? t.notes ?? '';
          const text = rawText.toString().substring(0, 1000);
          if (!text.trim()) continue;
          const effectiveDate = toIsoDate(t.created_at, t.created_at?.slice(0, 10) ?? '');
          const d: BackfillDrop = {
            drop_id: t.id as string,
            drop_type: 'todo',
            text,
            effective_date: effectiveDate,
          };
          const smartTitle = t.name ?? t.title;
          if (smartTitle) d.smart_title = (smartTitle as string).substring(0, 120);
          if (t.subtype) d.subtype = t.subtype as string;
          const tags = parseTags(t.tags);
          if (tags) d.tags = tags;
          drops.push(d);
        }

        for (const h of habitsRaw) {
          const text = (h.notes ?? '').toString().substring(0, 1000);
          if (!text.trim()) continue;
          const effectiveDate = toIsoDate(h.created_at, h.created_at?.slice(0, 10) ?? '');
          const d: BackfillDrop = {
            drop_id: h.id as string,
            drop_type: 'habit',
            text,
            effective_date: effectiveDate,
          };
          const smartTitle = h.title ?? h.name;
          if (smartTitle) d.smart_title = (smartTitle as string).substring(0, 120);
          if (h.subtype) d.subtype = h.subtype as string;
          const tags = parseTags(h.tags);
          if (tags) d.tags = tags;
          drops.push(d);
        }

        // Oldest first so the classifier sees the narrative build
        drops.sort((a, b) => a.effective_date.localeCompare(b.effective_date));

        return drops;
      });

      // ── Steps 4..N: process each batch ──────────────────────────
      const totalBatches = Math.ceil(allDrops.length / batchSize);
      const batchSummaries: BatchSummary[] = [];

      for (let i = 0; i < totalBatches; i++) {
        const batch = allDrops.slice(i * batchSize, (i + 1) * batchSize);

        const summary: BatchSummary = await step.run(
          `batch-${i + 1}-of-${totalBatches}`,
          async () => {
            const userPrompt = buildUserPrompt(graph, batch);

            // -- Call OpenAI ----------------------------------------------
            const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4.1-mini',
                temperature: 0.1,
                max_tokens: MAX_OUTPUT_TOKENS,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  { role: 'user', content: userPrompt },
                ],
              }),
            });

            if (!openAiRes.ok) {
              const errText = (await openAiRes.text().catch(() => '')).substring(0, 300);
              throw new Error(`OpenAI request failed: ${openAiRes.status} ${errText}`);
            }

            const completion = (await openAiRes.json()) as any;
            const inputTokens: number = completion.usage?.prompt_tokens ?? 0;
            const outputTokens: number = completion.usage?.completion_tokens ?? 0;
            const rawContent: string = completion.choices?.[0]?.message?.content ?? '';
            const finishReason: string = completion.choices?.[0]?.finish_reason ?? 'unknown';

            if (finishReason !== 'stop') {
              throw new Error(
                `batch_output_truncated: batch ${i + 1} returned finish_reason=${finishReason} ` +
                  `(expected 'stop'); batch_size=${batch.length}, max_tokens=${MAX_OUTPUT_TOKENS}. ` +
                  `Reduce batch_size in the event payload or raise max_tokens.`,
              );
            }

            let parsed: ClassifierResponse;
            try {
              parsed = JSON.parse(rawContent) as ClassifierResponse;
            } catch {
              throw new Error(
                `batch_parse_invalid: JSON.parse failed for batch ${i + 1}. ` +
                  `Raw content (first 300 chars): ${rawContent.substring(0, 300)}`,
              );
            }

            if (!Array.isArray(parsed.results)) {
              throw new Error(
                `batch_parse_invalid: results field missing or not an array in batch ${i + 1}`,
              );
            }

            // -- Validate and build upsert rows ---------------------------
            const validWorldIds = new Set(graph.worlds.map((w) => w.id));
            const validChapterIds = new Set(graph.chapters.map((c) => c.id));
            const validContextIds = new Set(graph.lifeContexts.map((lc) => lc.id));

            const batchDropIds = new Set(batch.map((d) => d.drop_id));
            const batchDropTypeMap = new Map(batch.map((d) => [d.drop_id, d.drop_type]));

            const worldLinkRows: any[] = [];
            const chapterLinkRows: any[] = [];
            const contextLinkRows: any[] = [];
            let discardedLinks = 0;
            const classifiedDropIds = new Set<string>();

            for (const result of parsed.results) {
              if (typeof result.drop_id !== 'string' || !batchDropIds.has(result.drop_id)) {
                console.warn(
                  '[DropAssignmentBackfill] result drop_id not in input batch; discarding',
                  {
                    drop_id: result.drop_id,
                    batch_index: i + 1,
                  },
                );
                continue;
              }

              const dropType = batchDropTypeMap.get(result.drop_id)!;
              const reason =
                typeof result.reason === 'string' ? result.reason.substring(0, 500) : null;

              classifiedDropIds.add(result.drop_id);

              const rawWorldLinks = Array.isArray(result.world_links) ? result.world_links : [];
              const rawChapterLinks = Array.isArray(result.chapter_links)
                ? result.chapter_links
                : [];
              const rawContextLinks = Array.isArray(result.context_links)
                ? result.context_links
                : [];

              for (const l of rawWorldLinks) {
                if (validWorldIds.has(l.world_id) && isFiniteScore(l.relevance_score)) {
                  worldLinkRows.push({
                    drop_id: result.drop_id,
                    drop_type: dropType,
                    world_id: l.world_id,
                    owner_id: userId,
                    relevance_score: l.relevance_score,
                    assigned_by: 'classifier',
                    reason,
                  });
                } else {
                  discardedLinks++;
                }
              }

              for (const l of rawChapterLinks) {
                if (validChapterIds.has(l.chapter_id) && isFiniteScore(l.relevance_score)) {
                  chapterLinkRows.push({
                    drop_id: result.drop_id,
                    drop_type: dropType,
                    chapter_id: l.chapter_id,
                    owner_id: userId,
                    relevance_score: l.relevance_score,
                    assigned_by: 'classifier',
                    reason,
                  });
                } else {
                  discardedLinks++;
                }
              }

              for (const l of rawContextLinks) {
                if (validContextIds.has(l.context_id) && isFiniteScore(l.relevance_score)) {
                  contextLinkRows.push({
                    drop_id: result.drop_id,
                    drop_type: dropType,
                    context_id: l.context_id,
                    owner_id: userId,
                    relevance_score: l.relevance_score,
                    assigned_by: 'classifier',
                    reason,
                  });
                } else {
                  discardedLinks++;
                }
              }
            }

            const unclassifiedDropCount = batch.filter(
              (d) => !classifiedDropIds.has(d.drop_id),
            ).length;

            // -- Upsert link tables ---------------------------------------
            const upsertHeaders = {
              ...makeSupabaseHeaders(env),
              Prefer: 'resolution=merge-duplicates,return=minimal',
            };

            if (worldLinkRows.length > 0) {
              const res = await fetch(`${env.SUPABASE_URL}/rest/v1/drop_world_links`, {
                method: 'POST',
                headers: upsertHeaders,
                body: JSON.stringify(worldLinkRows),
              });
              if (!res.ok) {
                const body = (await res.text().catch(() => '')).substring(0, 200);
                throw new Error(`drop_world_links upsert failed: ${res.status} ${body}`);
              }
            }

            if (chapterLinkRows.length > 0) {
              const res = await fetch(`${env.SUPABASE_URL}/rest/v1/drop_chapter_links`, {
                method: 'POST',
                headers: upsertHeaders,
                body: JSON.stringify(chapterLinkRows),
              });
              if (!res.ok) {
                const body = (await res.text().catch(() => '')).substring(0, 200);
                throw new Error(`drop_chapter_links upsert failed: ${res.status} ${body}`);
              }
            }

            if (contextLinkRows.length > 0) {
              const res = await fetch(`${env.SUPABASE_URL}/rest/v1/drop_context_links`, {
                method: 'POST',
                headers: upsertHeaders,
                body: JSON.stringify(contextLinkRows),
              });
              if (!res.ok) {
                const body = (await res.text().catch(() => '')).substring(0, 200);
                throw new Error(`drop_context_links upsert failed: ${res.status} ${body}`);
              }
            }

            console.log(`[DropAssignmentBackfill] batch ${i + 1}/${totalBatches} done`, {
              drops_in_batch: batch.length,
              world_links: worldLinkRows.length,
              chapter_links: chapterLinkRows.length,
              context_links: contextLinkRows.length,
              discarded: discardedLinks,
              unclassified: unclassifiedDropCount,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              user_id: userId.slice(0, 8),
            });

            return {
              batch_index: i + 1,
              drops_in_batch: batch.length,
              world_links_written: worldLinkRows.length,
              chapter_links_written: chapterLinkRows.length,
              context_links_written: contextLinkRows.length,
              discarded_links: discardedLinks,
              unclassified_drop_count: unclassifiedDropCount,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
            };
          },
        );

        batchSummaries.push(summary);
      }

      // ── Aggregate totals across all batches ──────────────────────
      const totalWorldLinks = batchSummaries.reduce((s, b) => s + b.world_links_written, 0);
      const totalChapterLinks = batchSummaries.reduce((s, b) => s + b.chapter_links_written, 0);
      const totalContextLinks = batchSummaries.reduce((s, b) => s + b.context_links_written, 0);
      const totalDiscarded = batchSummaries.reduce((s, b) => s + b.discarded_links, 0);
      const totalInputTokens = batchSummaries.reduce((s, b) => s + b.input_tokens, 0);
      const totalOutputTokens = batchSummaries.reduce((s, b) => s + b.output_tokens, 0);
      const estimatedCostUsd = estimateCost(totalInputTokens, totalOutputTokens);

      // ── Step N+1: write completed event ──────────────────────────
      await step.run('write-completed-event', async () => {
        const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
          auth: { persistSession: false },
        });
        const { error } = await db.from('events').insert({
          owner_id: userId,
          kind: 'drops.assignment_backfill_completed',
          payload_json: {
            user_id: userId,
            backfill_start: backfillStart,
            total_drops: allDrops.length,
            total_batches: totalBatches,
            batch_size: batchSize,
            total_world_links: totalWorldLinks,
            total_chapter_links: totalChapterLinks,
            total_context_links: totalContextLinks,
            total_discarded_links: totalDiscarded,
            total_input_tokens: totalInputTokens,
            total_output_tokens: totalOutputTokens,
            estimated_cost_usd: estimatedCostUsd,
            per_batch_summaries: batchSummaries,
          },
        });
        if (error) throw error;
      });

      // ── Return rollup for Inngest UI visibility ──────────────────
      return {
        user_id: userId,
        total_drops: allDrops.length,
        total_batches: totalBatches,
        total_world_links: totalWorldLinks,
        total_chapter_links: totalChapterLinks,
        total_context_links: totalContextLinks,
        total_discarded_links: totalDiscarded,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        estimated_cost_usd: estimatedCostUsd,
      };
    },
  );
}
