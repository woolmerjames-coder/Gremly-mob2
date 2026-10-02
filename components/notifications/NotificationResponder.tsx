/**
 * Opens what a notification tap points at, once navigation is ready, and asks
 * people already using Gremly once (the one ask) after the app has settled.
 * Mounted inside the NavigationContainer and the overlay provider.
 */
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { isBriefInChat } from '../../lib/brief/flag';
import { todayThreadParams } from '../../lib/brief/pinned';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { useNotificationUi } from '../../lib/notifications/store';
import { maybeAsk } from '../../lib/notifications/ask';

type Nav = { isReady?: () => boolean; navigate: (...args: any[]) => void };
type Overlay = ReturnType<typeof useGlobalOverlay>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let askedThisLaunch = false;

async function storeReady(): Promise<void> {
  for (let i = 0; i < 40 && !useGremlyStore.getState().isInitialized; i += 1) await wait(250);
}

/** Runs one route. Exported for tests. */
export async function runRoute(
  route: string,
  nav: Nav,
  overlay: Pick<Overlay, 'openEdit'>,
): Promise<void> {
  const [head, a, b] = route.split('/');
  switch (head) {
    case 'brief':
      if (isBriefInChat()) nav.navigate('Tabs', { screen: 'Gremly', params: todayThreadParams() });
      else nav.navigate('MorningBrief');
      return;
    case 'sweep':
      nav.navigate('Sweep');
      return;
    case 'summary':
      nav.navigate('WeeklySummary');
      return;
    case 'habit':
      if (a) nav.navigate('HabitDetail', { habitId: a });
      return;
    case 'item': {
      if (!a || !b) return;
      if (a === 'person') {
        const { data } = await supabase
          .from('people')
          .select('display_name,name')
          .eq('id', b)
          .maybeSingle();
        const personName = (data as any)?.display_name || (data as any)?.name;
        if (personName) nav.navigate('PersonDetail', { personName });
        return;
      }
      await storeReady();
      const s = useGremlyStore.getState();
      const list: any[] = a === 'todo' ? s.todos : a === 'habit' ? s.habits : s.notes;
      const record = list.find((r) => r.id === b);
      if (record) overlay.openEdit({ record });
      else nav.navigate('Tabs', { screen: 'Gremly' });
      return;
    }
    default:
      nav.navigate('Tabs', { screen: 'Gremly' });
  }
}

export default function NotificationResponder({
  navigationRef,
}: {
  navigationRef: { current: Nav | null };
}) {
  const pending = useNotificationUi((s) => s.pendingRoute);
  const overlay = useGlobalOverlay();

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 40; i += 1) {
        if (cancelled) return;
        const nav = navigationRef.current;
        if (nav?.isReady?.() !== false && nav) {
          const route = useNotificationUi.getState().takeRoute();
          if (route)
            await runRoute(route, nav, overlay).catch((err) =>
              console.warn('[Notifications] route failed:', err),
            );
          return;
        }
        await wait(250);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, navigationRef, overlay]);

  // People already using Gremly see the one ask once, after the app settles.
  const userId = useGremlyStore((s) => s.userId);
  const isInitialized = useGremlyStore((s) => s.isInitialized);
  const pastFirstDay = useGremlyStore((s) => s.hasSeenSweepUnlockModal || (s.gremlyAge ?? 0) >= 1);
  useEffect(() => {
    if (askedThisLaunch || !userId || !isInitialized || !pastFirstDay) return;
    const t = setTimeout(() => {
      if (askedThisLaunch) return;
      askedThisLaunch = true;
      void maybeAsk('open');
    }, 3000);
    return () => clearTimeout(t);
  }, [userId, isInitialized, pastFirstDay]);

  return null;
}
