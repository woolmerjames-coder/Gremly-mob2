/**
 * What a World page and a Chapter page both do with the things in them:
 * tick a step, add one, check in a habit, tick a list, turn a list item into
 * a step, and take something out. Each says what happened, with Undo.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Habit, Note, Todo } from '../../lib/types';
import { isDone } from '../../lib/worlds/model';
import { showFailed, showSnack } from '../../lib/worlds/snack';
import { stepTitle } from './UpNextCard';

type Where = { worldId?: string | null; chapterId?: string | null };

/** A light tap under the finger when something is ticked. Never holds anything up. */
export function lightTap() {
  Promise.resolve()
    .then(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
    .catch(() => undefined);
}

export function usePageActions() {
  const completeTodo = useGremlyStore((s) => s.completeTodo);
  const uncompleteTodo = useGremlyStore((s) => s.uncompleteTodo);
  const createTodo = useGremlyStore((s) => s.createTodo);
  const completeHabit = useGremlyStore((s) => s.completeHabit);
  const uncompleteHabit = useGremlyStore((s) => s.uncompleteHabit);
  const updateNote = useGremlyStore((s) => s.updateNote);
  const placeItem = useGremlyStore((s) => s.placeItem);
  const takeItemOut = useGremlyStore((s) => s.takeItemOut);
  const deleteTodo = useGremlyStore((s) => s.deleteTodo);
  // Ticked while the page is open: they stay where they are until it is left.
  const [justTicked, setJustTicked] = useState<Set<string>>(() => new Set());
  useFocusEffect(useCallback(() => () => setJustTicked((s) => (s.size ? new Set() : s)), []));

  const toggleStep = useCallback(
    async (step: Todo) => {
      lightTap();
      try {
        if (isDone(step)) {
          await uncompleteTodo(step.id);
          return;
        }
        setJustTicked((s) => new Set(s).add(step.id));
        await completeTodo(step.id);
        showSnack(`Ticked off: ${stepTitle(step)}`, () => uncompleteTodo(step.id));
      } catch (err) {
        showFailed('Ticking that off', err);
      }
    },
    [completeTodo, uncompleteTodo],
  );

  const addTodo = useCallback(
    async (text: string, where: Where) => {
      try {
        const todo = await createTodo({
          name: text,
          title: text,
          ai_placed: false,
          origin: 'manual',
        });
        const placed = await placeItem({ id: todo.id, type: 'todo' }, where);
        const undo = async () => {
          await placed();
          await deleteTodo(todo.id);
        };
        return { todo, undo };
      } catch (err) {
        showFailed('Adding it', err);
        return null;
      }
    },
    [createTodo, placeItem, deleteTodo],
  );

  const toggleHabit = useCallback(
    async (h: Habit, doneToday: boolean) => {
      lightTap();
      try {
        if (doneToday) await uncompleteHabit(h.id);
        else await completeHabit(h.id);
      } catch (err) {
        showFailed('Checking in', err);
      }
    },
    [completeHabit, uncompleteHabit],
  );

  const setRows = useCallback(
    async (note: Note, rows: NonNullable<Note['list_items']>) => {
      try {
        await updateNote(note.id, { list_items: rows, has_list: true });
      } catch (err) {
        showFailed('That list', err);
      }
    },
    [updateNote],
  );

  const takeOut = useCallback(
    async (item: { id: string; type: 'todo' | 'note' | 'habit' }, where: Where, what: string) => {
      try {
        const undo = await takeItemOut(item, where);
        showSnack(`Taken out of this ${what}.`, undo);
      } catch (err) {
        showFailed('Taking it out', err);
      }
    },
    [takeItemOut],
  );

  return { justTicked, toggleStep, addTodo, toggleHabit, setRows, takeOut };
}
