/**
 * The little bit of notification state the UI needs: whether the one ask is
 * showing, and a route waiting for navigation to be ready (a tap can arrive
 * before the app has finished starting).
 */
import { create } from 'zustand';
import type { AskVariant } from './constants';

export type AskSource = 'onboarding' | 'open' | 'bell' | 'settings';

interface NotificationUi {
  ask: { variant: AskVariant; source: AskSource; step: 'ask' | 'done' } | null;
  pendingRoute: string | null;
  showAsk: (variant: AskVariant, source: AskSource) => void;
  askDone: () => void;
  hideAsk: () => void;
  openRoute: (route: string) => void;
  takeRoute: () => string | null;
}

export const useNotificationUi = create<NotificationUi>((set, get) => ({
  ask: null,
  pendingRoute: null,
  showAsk: (variant, source) => set({ ask: { variant, source, step: 'ask' } }),
  askDone: () => {
    const a = get().ask;
    if (a) set({ ask: { ...a, step: 'done' } });
  },
  hideAsk: () => set({ ask: null }),
  openRoute: (route) => set({ pendingRoute: route }),
  takeRoute: () => {
    const r = get().pendingRoute;
    if (r) set({ pendingRoute: null });
    return r;
  },
}));
