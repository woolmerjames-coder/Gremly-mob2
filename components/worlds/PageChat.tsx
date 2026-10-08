/**
 * A World's or a Chapter's own chat (Worlds rebuild, stage 2): Ask Gremly tied
 * to that page, the way an item's chat is tied to its item
 * (components/chat/ItemChatScreen.tsx). One chat for each page that carries on
 * each time it is opened, found by the page it is anchored to; every turn is
 * sent with the page, so Gremly knows what "this" means and what is on it, and
 * a correction said here reaches the page's words. It is also in Ask Gremly's
 * list of chats, like an item's chat. Changes come on the same card, with the
 * same tap and Undo.
 *
 * The box on the Worlds home opens the same chat with no page: fresh each
 * time, with Gremly's own line, keeping no thread of its own; what was said
 * there is in Ask Gremly's list of chats, to carry on.
 */
import { useMemo } from 'react';
import { Modal } from 'react-native';
import {
  CalendarClock,
  CircleCheck,
  Compass,
  ListChecks,
  Merge,
  Pencil,
  Shapes,
  Sparkles,
} from 'lucide-react-native';
import AskGremlyScreen from '../../app/tabs/AskGremlyScreen';
import type { ItemStarter } from '../../lib/chat/itemStarters';

export type PageKind = 'world' | 'chapter' | 'home';

/** What Gremly offers to start with, for each kind of page (the prototype's chips). */
export const PAGE_STARTERS: Record<PageKind, ItemStarter[]> = {
  chapter: [
    { key: 'plan', label: 'Help me plan this', prompt: 'Help me plan this', icon: ListChecks },
    {
      key: 'dates',
      label: 'The dates changed',
      prompt: 'The dates for this have changed',
      icon: CalendarClock,
    },
    { key: 'done', label: 'This is done', prompt: 'This is done', icon: CircleCheck },
  ],
  home: [
    {
      key: 'next',
      label: 'What is coming up',
      prompt: 'What is coming up for me across my Worlds?',
      icon: Compass,
    },
    {
      key: 'new',
      label: 'Start something new',
      prompt: 'I want to start something new',
      icon: Sparkles,
    },
    {
      key: 'tidy',
      label: 'Tidy my Worlds',
      prompt: 'Help me tidy up my Worlds and Chapters',
      icon: Shapes,
    },
  ],
  world: [
    {
      key: 'start',
      label: 'Start a Chapter here',
      prompt: 'I want to start something new in this World',
      icon: Sparkles,
    },
    { key: 'rename', label: 'Rename it', prompt: 'I want to rename this World', icon: Pencil },
    {
      key: 'merge',
      label: 'Merge it with another',
      prompt: 'I want to merge this World with another one',
      icon: Merge,
    },
  ],
};

/** The words in the chat's header above the page's name. */
const LABEL: Record<PageKind, string> = { world: 'World', chapter: 'Chapter', home: 'Worlds' };

/** Gremly's line when the box on the Worlds home opens. */
export const HOME_OPENER =
  'What would you like to do? I can start something new, tidy your Worlds and Chapters, or look at what is coming up.';

export function PageChat({
  visible,
  kind,
  id,
  title,
  onClose,
}: {
  visible: boolean;
  kind: PageKind;
  /** The page's id and name; none for the Worlds home */
  id?: string;
  title?: string;
  onClose: () => void;
}) {
  const item = useMemo(
    () =>
      kind === 'home' || !id || !title
        ? {
            anchor: null,
            label: LABEL.home,
            title: 'Ask Gremly',
            opener: HOME_OPENER,
            starters: PAGE_STARTERS.home,
            onClose,
          }
        : {
            anchor: { id, type: kind, title },
            label: LABEL[kind],
            starters: PAGE_STARTERS[kind],
            onClose,
          },
    [id, kind, title, onClose],
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {visible ? <AskGremlyScreen item={item} /> : null}
    </Modal>
  );
}
