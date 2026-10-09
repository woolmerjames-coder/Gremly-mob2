export declare function stepsOnClosedChapters(
  d: { select: (path: string) => Promise<any[]> },
  userId: string,
): Promise<Set<string>>;
export declare function withoutClosedSteps<T extends { id?: string }>(
  rows: T[] | null | undefined,
  left: Set<string> | null | undefined,
): T[];
