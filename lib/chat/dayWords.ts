/**
 * Days and times in the words cards use: "Thu 1 Oct", "Today", "2:00pm".
 * Shared by chat's item card (lib/chat/entityCards) and the change model's
 * words (lib/changes/words).
 */
import { getDateService } from '../date/DateService';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DayWordsOptions {
  /**
   * "Today" and "Tomorrow" when they apply (the default). Off for words that
   * are kept, such as the closing line saved on a tapped card, which would
   * otherwise be wrong the next day.
   */
  relative?: boolean;
}

/** "Thu 1 Oct" from YYYY-MM-DD, "Today" and "Tomorrow" when they apply. */
export function formatDay(dateStr: string | null | undefined, opts: DayWordsOptions = {}): string {
  if (!dateStr) return '';
  const ds = getDateService();
  if (opts.relative !== false && ds.isToday(dateStr)) return 'Today';
  if (opts.relative !== false && ds.isTomorrow(dateStr)) return 'Tomorrow';
  const d = ds.fromLocalDate(dateStr);
  if (!d) return dateStr;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Several days in one phrase: "Mon 28 Sep and today". */
export function formatDays(days: string[], opts: DayWordsOptions = {}): string {
  const words = days.map((d, i) => {
    const w = formatDay(d, opts);
    return i > 0 && (w === 'Today' || w === 'Tomorrow') ? w.toLowerCase() : w;
  });
  if (words.length < 2) return words[0] || '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "2:00pm" from HH:mm (a seconds part is ignored). */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}${suffix}`;
}
