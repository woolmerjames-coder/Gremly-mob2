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

/**
 * A pill above the box in Chat: the next message is not an ordinary one (it is
 * saved to the journal, or answers Gremly's question), with an X to send it
 * to Gremly instead.
 */
export type ChatTag = {
  label: string;
  kind: 'journal' | 'question';
  /** Left out when the next message can only be what the pill says */
  onCancel?: () => void;
  /** Open the full journal page, given whatever is typed in the box, which is then cleared */
  onExpand?: (typed: string) => void;
  /** A word for the expand button ("Open"); two arrows when left out */
  expandLabel?: string;
  expandHint?: string;
};

export type HomeDockApi = {
  /** The Drop page hands over its input block; null takes it away */
  setDock: (node: React.ReactNode) => void;
  /** The Chat page registers how to send; null when it unmounts */
  registerChat: (api: HomeChatApi | null) => void;
  getChat: () => HomeChatApi | null;
  /** The Chat page reports when it is busy sending */
  setChatSending: (sending: boolean) => void;
  /** The Chat page asks for different words in the empty box (null for the usual) */
  setChatPlaceholder: (text: string | null) => void;
  /** The Chat page says what the next message is, above the box (null for an ordinary message) */
  setChatTag: (tag: ChatTag | null) => void;
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
  /** Words for the empty box in Chat mode, such as "Type your answer…"; null for the usual */
  chatPlaceholder: string | null;
  /** What the next message is, shown above the box; null for an ordinary message */
  chatTag: ChatTag | null;
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
