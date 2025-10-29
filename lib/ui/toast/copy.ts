export type OrganizedKind = 'todo' | 'habit' | 'note';

export const ORGANIZED_TOAST_PREFIX = '✅ Organized into ';

export function friendlyKind(kind: OrganizedKind): OrganizedKind {
  if ((kind as any) === 'task') return 'todo';
  return kind;
}

export function organizedToastContent(kind: OrganizedKind, count = 1): string {
  const k = friendlyKind(kind);
  const plural = count === 1 ? k : `${k}s`;
  return `${ORGANIZED_TOAST_PREFIX}${count} ${plural}`;
}
