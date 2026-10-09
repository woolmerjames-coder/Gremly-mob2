/**
 * Where a new drop was filed, as filing replied (the assign-worlds route,
 * workers/inngest-jobs/context/filing.js, data fabric stage 4a). The store
 * keeps it by the drop's saved id for the Worlds build's filing chip on the
 * drop card. Only what this session dropped is kept here; a drop's filing is
 * always on its links in the database too.
 */
export interface DropFiling {
  /** Who placed it: Gremly, the person themselves, or nobody (filed nowhere) */
  by: 'gremly' | 'person' | null;
  world: { id: string; name: string } | null;
  chapter: { id: string; title: string } | null;
  /** It fits nothing yet and looks like the start of something */
  startsSomething: boolean;
  /** When the reply came */
  at: string;
}

function place<T extends 'name' | 'title'>(raw: unknown, key: T): ({ id: string } & Record<T, string>) | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r[key] !== 'string') return null;
  return { id: r.id, [key]: r[key] } as { id: string } & Record<T, string>;
}

/**
 * The filing in a reply, or null when there is none to keep: from a cortex
 * that does not send one, or when filing could not run (skipped), which is no
 * decision about where the drop belongs. Pure.
 */
export function filingFromReply(data: unknown, at: string): DropFiling | null {
  if (!data || typeof data !== 'object') return null;
  if ((data as Record<string, unknown>).skipped === true) return null;
  const filed = (data as Record<string, unknown>).filed;
  if (!filed || typeof filed !== 'object') return null;
  const f = filed as Record<string, unknown>;
  const by = f.by === 'gremly' || f.by === 'person' ? f.by : null;
  return {
    by,
    world: place(f.world, 'name'),
    chapter: place(f.chapter, 'title'),
    startsSomething: f.starts_something === true,
    at,
  };
}
