/**
 * The app's request for a scenario, as lib/brief/useDayTurn.ts
 * buildDayTurnRequest builds it. Shared by the day turn's replay (run.mjs)
 * and the agent's (run-agent.mjs).
 */

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function bodyFor(s) {
  const titleOf = new Map((s.items || []).map((x) => [x.id, x.title]));
  const kindOf = new Map((s.items || []).map((x) => [x.id, x.kind]));
  const rec = s.record || {};
  const blocks = (rec.blocks || []).map(([at, title, travel], i) => ({
    id: `b${i + 1}`,
    title,
    start: toMin(at),
    end: null,
    travel: !!travel,
  }));
  const departs = rec.travel?.[1] ? toMin(rec.travel[1]) : (blocks.find((b) => b.travel)?.start ?? null);
  return {
    text: s.text,
    question: s.question || null,
    // Gremly's task list so far in the thread, as the app keeps it (agent only)
    tasks: s.tasks || [],
    history: s.history || [],
    date: s.today,
    now: toMin(s.at),
    items: (s.items || []).map((x) => ({
      due_day: null,
      due_time: null,
      minutes: null,
      note: '',
      ...x,
    })),
    meetings: (s.meetings || []).map(([from, to, title]) => ({ title, start: toMin(from), end: toMin(to) })),
    record: {
      travel: rec.travel ? { label: rec.travel[0], departs } : null,
      blocks,
      plan_end: rec.travel && departs !== null ? departs : 22 * 60,
    },
    plan: s.plan
      ? {
          status: s.plan.status,
          items: s.plan.items.map(([id, at, minutes]) => ({
            id,
            kind: kindOf.get(id) || 'todo',
            title: titleOf.get(id) || id,
            start: toMin(at),
            end: toMin(at) + minutes,
          })),
        }
      : null,
  };
}

