/**
 * What an item's chat offers to start with, by kind: the same starters the
 * old entity chat had, each a message the user sends with one tap.
 */
import type React from 'react';
import {
  AlertCircle,
  CheckSquare,
  Compass,
  Lightbulb,
  ListChecks,
  Search,
  Sparkles,
} from 'lucide-react-native';

export type ItemKind = 'todo' | 'habit' | 'note';

export type ItemStarter = {
  key: string;
  label: string;
  /** What is sent, as the user's own message */
  prompt: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

export const ITEM_STARTERS: Record<ItemKind, ItemStarter[]> = {
  todo: [
    {
      key: 'break_down',
      label: 'Break it down',
      prompt: 'Help me break this task into smaller steps',
      icon: ListChecks,
    },
    {
      key: 'whats_blocking',
      label: "What's blocking me?",
      prompt: "What might be blocking me from doing this? Let's figure it out.",
      icon: AlertCircle,
    },
    {
      key: 'think_through',
      label: 'Think it through',
      prompt: 'Help me think through how to approach this',
      icon: Lightbulb,
    },
    {
      key: 'research',
      label: 'What to look into first',
      prompt: 'What should I research or learn before starting this?',
      icon: Search,
    },
    {
      key: 'action_steps',
      label: 'Next actions',
      prompt: 'What are the concrete next actions I should take?',
      icon: CheckSquare,
    },
  ],
  habit: [
    {
      key: 'setup',
      label: 'Help me set this up',
      prompt:
        'Help me design this habit properly: what it should look like, when I should do it, how long it should take, and what will make it stick.',
      icon: Sparkles,
    },
    {
      key: 'why_skipping',
      label: 'Why do I keep skipping?',
      prompt:
        "I've been struggling to stay consistent with this habit. Help me figure out what's getting in the way.",
      icon: AlertCircle,
    },
    {
      key: 'make_easier',
      label: 'Make it easier',
      prompt:
        'Help me find ways to lower the friction for this habit: maybe stack it with something, reduce the scope, or find a better trigger.',
      icon: Compass,
    },
  ],
  note: [
    {
      key: 'expand',
      label: 'Expand on this',
      prompt: 'Help me expand on this idea',
      icon: Sparkles,
    },
    {
      key: 'action_steps',
      label: 'Make it actionable',
      prompt: 'Turn this into actionable steps',
      icon: CheckSquare,
    },
    {
      key: 'think_through',
      label: 'Think deeper',
      prompt: 'Help me think deeper about this',
      icon: Lightbulb,
    },
    {
      key: 'research',
      label: 'What to explore',
      prompt: 'What related topics should I explore?',
      icon: Search,
    },
  ],
};

/**
 * The message an item's chat opens with when a screen asks for one: a
 * starter by its key, or the words a screen passed (Sweep passes a sentence).
 */
export function openingPrompt(kind: ItemKind, preset?: string | null): string | null {
  if (!preset) return null;
  const starter = ITEM_STARTERS[kind].find((s) => s.key === preset);
  if (starter) return starter.prompt;
  const words = String(preset).trim();
  return words || null;
}

/** What the chat's header calls the item: Todo, Habit, Event, Journal, Note. */
export function itemKindLabel(kind: ItemKind, subtype?: string | null): string {
  if (kind === 'todo') return 'Todo';
  if (kind === 'habit') return 'Habit';
  if (subtype === 'event') return 'Event';
  if (subtype === 'journal') return 'Journal';
  if (subtype === 'idea') return 'Idea';
  return 'Note';
}
