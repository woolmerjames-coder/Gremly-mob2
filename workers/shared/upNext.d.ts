// Types for upNext.js, for the app's TypeScript (the Worlds screens use the
// same Up next rule as the brief).
export interface UpNextChapterRow {
  id: string;
  title?: string | null;
  phase?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  closed_at?: string | null;
  primary_world_id?: string | null;
  world?: { name?: string | null; display_name?: string | null } | null;
}
export interface NextDate {
  date: string;
  which: 'starts' | 'ends';
}
export interface UpNext {
  chapter_id: string;
  title: string | null;
  world_id: string | null;
  world: string | null;
  date: string;
  which: 'starts' | 'ends';
  days_until: number;
}
export declare const OPEN_CHAPTER_PHASES: readonly string[];
export declare function nextDateOf(chapter: UpNextChapterRow, today: string): NextDate | null;
export declare function upNext(chapters: UpNextChapterRow[], today: string): UpNext | null;
export declare function upNextSelect(userId: string): string;
export declare function loadUpNext(
  d: unknown,
  userId: string,
  today: string,
): Promise<UpNext | null>;
export declare function upNextWords(u: UpNext | null): string;
