// Types for filing.js, for the TypeScript workers that import it
// (dropAssignmentBackfill.ts).

export interface FilingDrop {
  id: string;
  entity_type: 'note' | 'todo' | 'habit';
  text: string;
  title: string | null;
  date: string | null;
  tags: string[];
  people: string[];
}

export interface FilingGraph {
  worlds: Array<{ id: string; name: string; description: string | null }>;
  chapters: Array<{
    id: string;
    title: string;
    description: string | null;
    primary_world_id: string | null;
    phase: string;
    start_date: string | null;
    end_date: string | null;
  }>;
  contexts: Array<{ id: string; name: string; kind: string | null; description: string | null }>;
}

export interface FilingPlaced {
  worlds: Map<string, string[]>;
  chapters: Map<string, string[]>;
}

export interface Filed {
  skipped: boolean;
  skipped_reason: string | null;
  by: 'gremly' | 'person' | null;
  world: { id: string; name: string } | null;
  chapter: { id: string; title: string } | null;
  contexts: Array<{ id: string; name: string; relevance: number }>;
  starts_something: boolean;
  reason: string | null;
  model?: string;
  counts: { world_links: number; chapter_links: number; context_links: number };
}

export declare const FILING_PROMPT_VERSION: string;
export declare const FILING_CUT: Readonly<{ chapter: number; world: number }>;
export declare function loadGraph(env: unknown, userId: string): Promise<FilingGraph>;
export declare function loadPlaced(env: unknown, userId: string): Promise<FilingPlaced>;
export declare function personToday(env: unknown, userId: string): Promise<string>;
export declare function listDropsToFile(
  env: unknown,
  userId: string,
  opts: { before: string; refile?: boolean },
): Promise<FilingDrop[]>;
export declare function fileDrop(
  env: unknown,
  args: {
    userId: string;
    drop: FilingDrop;
    today?: string | null;
    graph?: FilingGraph | null;
    placed?: FilingPlaced | null;
  },
): Promise<Filed>;
export declare function dropFromRow(type: 'note' | 'todo' | 'habit', row: unknown): FilingDrop;
