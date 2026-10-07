/**
 * The one ask: a single sheet, a single yes. Saying yes switches everything on
 * and saves the words they saw. Not now waits two weeks, or until they tap the
 * bell on an item (then at most once a day).
 */
import { Linking } from 'react-native';
import { supabase } from '../supabase/client';
import { getDateService, nowTimestamp } from '../date/DateService';
import { readPermission, requestPermission, syncDevice, isExpoGo, type Permission } from './device';
import { ASK_COPY, ASK_GAP_DAYS, type AskVariant } from './constants';
import { useNotificationUi, type AskSource } from './store';

const DAY_MS = 86400000;

interface AskPrefs {
  checkins_opted_in_at: string | null;
  last_permission_ask_at: string | null;
}

/** Which sheet to show, if any. Pure, for tests. */
export function chooseAskVariant({
  permission,
  prefs,
  source,
  now,
}: {
  permission: Permission;
  prefs: AskPrefs | null;
  source: AskSource;
  now: Date;
}): AskVariant | null {
  const opted = !!prefs?.checkins_opted_in_at;
  const last = prefs?.last_permission_ask_at ? Date.parse(prefs.last_permission_ask_at) : null;
  const gap = source === 'bell' || source === 'settings' ? DAY_MS : ASK_GAP_DAYS * DAY_MS;
  const due = source === 'settings' || last == null || now.getTime() - last >= gap;
  if (permission === 'granted' || permission === 'provisional') {
    return opted || !due ? null : 'existing';
  }
  if (!due) return null;
  return permission === 'denied' ? 'denied' : 'new';
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function savePrefs(patch: Record<string, unknown>): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from('notification_preferences')
    .update(patch)
    .eq('user_id', userId);
  if (error) console.warn('[Notifications] could not save the answer:', error.message);
}

/** Which ask is due now for this person, if any, without showing it. */
export async function pendingAsk(source: AskSource): Promise<AskVariant | null> {
  if (isExpoGo) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const [permission, prefsRes] = await Promise.all([
    readPermission(),
    supabase
      .from('notification_preferences')
      .select('checkins_opted_in_at,last_permission_ask_at')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  return chooseAskVariant({
    permission,
    prefs: (prefsRes.data as AskPrefs | null) ?? null,
    source,
    now: getDateService().now(),
  });
}

// The ask the app makes by itself once it has settled (source 'open',
// NotificationResponder) can be put off for this launch
let openAskPutOff = false;

/**
 * Put off the ask the app makes by itself, for this launch: the person has
 * just gone into something it would land on top of. It is due again the next
 * time the app opens.
 */
export function putOffOpenAsk(): void {
  openAskPutOff = true;
}

/**
 * Shows the sheet when it is due. Returns true when it showed. The sheet is
 * drawn over the app, under any open modal, so it appears as soon as that closes.
 */
export async function maybeAsk(source: AskSource): Promise<boolean> {
  if (useNotificationUi.getState().ask) return true;
  if (source === 'open' && openAskPutOff) return false;
  const variant = await pendingAsk(source);
  if (!variant) return false;
  useNotificationUi.getState().showAsk(variant, source);
  return true;
}

/**
 * The yes. Returns 'on' when notifications are on, 'declined' when iOS's own
 * prompt was refused, and 'settings' when it sent them to iPhone Settings.
 */
export async function answerYes(variant: AskVariant): Promise<'on' | 'declined' | 'settings'> {
  const copy = ASK_COPY[variant];
  const now = nowTimestamp();
  const consent = {
    checkins_enabled: true,
    checkins_opted_in_at: now,
    checkins_opt_in_words: `${copy.title} ${copy.body}`,
    last_permission_ask_at: now,
  };
  if (variant === 'denied') {
    // the words on the sheet name every kind; iOS Settings is the only place left to say yes
    await savePrefs(consent);
    await Linking.openSettings();
    return 'settings';
  }
  let permission = await readPermission();
  if (permission === 'undetermined') permission = await requestPermission();
  if (permission === 'granted' || permission === 'provisional') {
    await savePrefs(consent);
    await syncDevice({ force: true });
    return 'on';
  }
  await savePrefs({ last_permission_ask_at: now });
  return 'declined';
}

export async function answerNotNow(): Promise<void> {
  await savePrefs({ last_permission_ask_at: nowTimestamp() });
}
