// Types for worldsFields.js, for the TypeScript workers that import it (worldsWriter.ts).
export declare const OLD_WORLDS_FIELDS: Readonly<{
  chapters: readonly string[];
  worlds: readonly string[];
}>;
export declare const OLD_WORLD_PHASES: readonly string[];
export declare function oldWorldsFieldsStopped(env: { WORLDS_OLD_FIELDS?: string } | null | undefined): boolean;
export declare function withoutOldFields<T extends Record<string, unknown>>(
  table: 'chapters' | 'worlds',
  patch: T,
  env: { WORLDS_OLD_FIELDS?: string } | null | undefined,
): T;
