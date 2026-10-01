/**
 * briefInChat: the one switch for the Daily brief in Chat project.
 *
 * Per person, from cortex_preferences.brief_in_chat. On for everyone since
 * 1 Oct 2026 (the column defaults to true); setting it to false for one
 * person returns them to the old morning brief without a new build. A build
 * can force it with EXPO_PUBLIC_BRIEF_IN_CHAT=on or off (local testing).
 *
 * While it is off for someone, the old morning brief behaves exactly as before.
 */

import { useGremlyStore } from '../store/useGremlyStore';

type Forced = 'on' | 'off' | null;

function forced(): Forced {
  const raw = (process.env.EXPO_PUBLIC_BRIEF_IN_CHAT ?? '').toLowerCase();
  return raw === 'on' || raw === 'off' ? raw : null;
}

/** The switch for a stored value; the build override wins when it is set. */
export function briefInChatOn(stored: boolean | null | undefined): boolean {
  const f = forced();
  if (f) return f === 'on';
  return stored === true;
}

/** Read outside React (event handlers, navigation). */
export function isBriefInChat(): boolean {
  return briefInChatOn(useGremlyStore.getState().briefInChat);
}

/** Read in components; re-renders when the stored value changes. */
export function useBriefInChat(): boolean {
  const stored = useGremlyStore((s) => s.briefInChat);
  return briefInChatOn(stored);
}
