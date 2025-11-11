import type { V2State, BaseType } from './overlayV2.state';

export function toCreateOrUpdateInput(baseType: BaseType, s: V2State, spaceIdProp: string | null) {
  if (baseType === 'todo') {
    return {
      type: 'todo' as const,
      title: s.todo.title || s.todo.details.split(/\r?\n/)[0] || 'Untitled',
      details: s.todo.details || null,
      due_at: s.todo.due_at ?? s.reminderAt ?? null,
      space_id: s.spaceId ?? spaceIdProp ?? null,
      origin: 'catchall' as const,
      tags: [...s.tags],
    };
  }
  if (baseType === 'habit') {
    return {
      type: 'habit' as const,
      title: s.habit.title || s.habit.notes.split(/\r?\n/)[0] || 'Untitled',
      notes: s.habit.notes || null,
      frequency: s.habit.schedule ?? 'custom',
      space_id: s.spaceId ?? spaceIdProp ?? null,
      origin: 'catchall' as const,
      tags: [...s.tags],
    };
  }

  // note
  const base: any = {
    type: 'note' as const,
    subtype: 'catchall' as const,
    title: s.log.title || s.log.body.split(/\r?\n/)[0] || 'Untitled note',
    body: s.log.body,
    space_id: s.spaceId ?? spaceIdProp ?? null,
    origin: 'catchall' as const,
    tags: [...s.tags],
  };

  const moodPatch = s.tags.includes('journal') ? { mood: s.mood ?? 'neu' } : { mood: null };

  let fmtVal: any = null;
  if (s.tags.includes('list')) fmtVal = 'checkboxes';
  else if (s.format) fmtVal = s.format;
  const fmtPatch = fmtVal ? { fmt: fmtVal } : {};

  const datePatch = s.reminderAt ? { date: s.reminderAt } : {};

  return { ...base, ...moodPatch, ...fmtPatch, ...datePatch };
}

export async function linkSelectedPerson(repo: any, entityId?: string, personId?: string) {
  if (!entityId || !personId) return;
  const linkFn =
    (repo as any).linkPersonToEntity ??
    (repo as any).entities?.linkPerson ??
    (repo as any).people?.linkToEntity;
  if (typeof linkFn === 'function') {
    await linkFn.call(repo, { entityId, personId });
  }
}
