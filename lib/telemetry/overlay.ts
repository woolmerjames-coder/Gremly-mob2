import { FF_OVERLAY_TELEMETRY } from '../flags';
import { getDateService } from '../date/DateService';

type OverlayEvent =
  | { type: 'overlay_open'; mode: 'create' | 'edit' | 'view'; entryType: 'log' | 'todo' | 'habit' }
  | {
      type: 'overlay_save';
      entryType: 'log' | 'todo' | 'habit';
      titleLen: number;
      tagCount: number;
      dueAt?: string | null;
    }
  | { type: 'overlay_title_resummarize' }
  | { type: 'overlay_tags_resuggest' }
  | { type: 'overlay_tag_user_add'; label: string }
  | { type: 'overlay_tag_user_remove'; label: string; wasAi: boolean }
  | { type: 'overlay_due_set' }
  | { type: 'overlay_due_clear' };

export async function emitOverlayEvent(evt: OverlayEvent) {
  if (!FF_OVERLAY_TELEMETRY) return;
  try {
    const url = process.env.EXPO_PUBLIC_CORTEX_LOGS_URL ?? '';
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ts: getDateService().now().getTime(), evt }),
    });
  } catch (_error) {
    // swallow telemetry failures to keep UX responsive
  }
}
