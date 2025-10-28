// Minimal tracer for one capture cycle
export type TraceCtx = {
  id: string;
  t0: number;
  steps: Array<{ at: number; msg: string; data?: any }>;
};

export function startCatchallTrace(label = 'catchall'): TraceCtx {
  const id = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = globalThis?.performance?.now?.() ?? Date.now();
  return { id, t0: now, steps: [] };
}

export function step(ctx: TraceCtx, msg: string, data?: any) {
  const at = (globalThis?.performance?.now?.() ?? Date.now()) - ctx.t0;
  ctx.steps.push({ at, msg, data });
  // eslint-disable-next-line no-console
  console.log('[TRACE]', ctx.id, msg, data ? safePreview(data) : undefined);
}

export function end(ctx: TraceCtx, outcome: string, data?: any) {
  const total = (globalThis?.performance?.now?.() ?? Date.now()) - ctx.t0;
  // eslint-disable-next-line no-console
  console.log('[TRACE][END]', ctx.id, {
    outcome,
    totalMs: Math.round(total),
    steps: ctx.steps.length,
    data: data ? safePreview(data) : undefined,
  });
}

function safePreview(v: any) {
  try {
    if (typeof v === 'string') return v.slice(0, 200);
    const j = JSON.stringify(v);
    return j.length > 400 ? `${j.slice(0, 400)}…` : j;
  } catch {
    return String(v);
  }
}
