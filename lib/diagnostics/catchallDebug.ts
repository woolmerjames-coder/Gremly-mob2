// Minimal tracer for one capture cycle
export type TraceCtx = {
  id: string;
  t0: number;
  steps: Array<{ at: number; msg: string; data?: unknown }>;
};

export function startCatchallTrace(label = 'catchall'): TraceCtx {
  const id = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = globalThis?.performance?.now?.() ?? Date.now();
  return { id, t0: now, steps: [] };
}

export function step(ctx: TraceCtx, msg: string, data?: unknown) {
  const at = (globalThis?.performance?.now?.() ?? Date.now()) - ctx.t0;
  ctx.steps.push({ at, msg, data });
  // eslint-disable-next-line no-console
  console.log('[TRACE]', ctx.id, msg, data ? safePreview(data) : undefined);
}

export function end(ctx: TraceCtx, outcome: string, data?: unknown) {
  const total = (globalThis?.performance?.now?.() ?? Date.now()) - ctx.t0;
  // eslint-disable-next-line no-console
  console.log('[TRACE][END]', ctx.id, {
    outcome,
    totalMs: Math.round(total),
    steps: ctx.steps.length,
    data: data ? safePreview(data) : undefined,
  });
}

function safePreview(value: unknown) {
  try {
    if (typeof value === 'string') return value.slice(0, 200);
    const json = JSON.stringify(value);
    return json.length > 400 ? `${json.slice(0, 400)}…` : json;
  } catch {
    return String(value);
  }
}
