/**
 * GremlyHomeDock - how the Drop and Chat pages share one input box.
 *
 * The Gremly home shows its pages side by side and one input box underneath
 * them that does not move while the pages slide. The Drop page (Mind Drop)
 * owns that box: it hands the box's element to the home through setDock, and
 * the home renders it below the pages. In Chat mode the same box sends to the
 * Chat page, which registers its send function here.
 *
 * Two contexts, on purpose: HomeDockContext never changes value, so the pages
 * that use it do not re-render every time the box is handed over (which would
 * hand it over again, and so on). HomeModeContext changes only when the mode
 * or the chat's busy state changes.
 */

import { createContext, useContext } from 'react';
import type React from 'react';

export type HomeChatApi = {
  send: (text: string) => void;
  isSending: () => boolean;
};

export type HomeDockApi = {
  /** The Drop page hands over its input block; null takes it away */
  setDock: (node: React.ReactNode) => void;
  /** The Chat page registers how to send; null when it unmounts */
  registerChat: (api: HomeChatApi | null) => void;
  getChat: () => HomeChatApi | null;
  /** The Chat page reports when it is busy sending */
  setChatSending: (sending: boolean) => void;
  /** The Chat page reports when the conversation is being scrolled */
  setChatScrolling: (scrolling: boolean) => void;
  /** Puts text into the shared box (a prompt another screen opened Chat with) */
  prefillDraft: (text: string) => void;
  /** The Drop page registers how to set the box's text */
  registerDraftSetter: (setter: ((text: string) => void) | null) => void;
  /** Opens the keyboard on the shared box (Chat opened from Talk it through) */
  focusInput: () => void;
  /** The Drop page registers how to focus the box */
  registerFocus: (focus: (() => void) | null) => void;
};

export type HomeModeState = {
  mode: 'drop' | 'chat';
  chatSending: boolean;
  /** The conversation is being scrolled (Gremly steps aside while it is) */
  chatScrolling: boolean;
};

export const HomeDockContext = createContext<HomeDockApi | null>(null);
export const HomeModeContext = createContext<HomeModeState | null>(null);

/** Null outside the Gremly home */
export function useHomeDock(): HomeDockApi | null {
  return useContext(HomeDockContext);
}

/** Null outside the Gremly home */
export function useHomeMode(): HomeModeState | null {
  return useContext(HomeModeContext);
}
