/**
 * useEchoSafeText - keeps a text box's own text so typing never jumps.
 *
 * React Native pushes a TextInput's value to the native box whenever the
 * value prop differs from the last text the box reported. When the value
 * reaches the box a render late (the Gremly home renders the shared box from
 * an element the Drop page hands over after each change), the box is first
 * re-rendered with the old text and React Native pushes that old text back
 * to the native box: the caret jumps, the next letter lands before the end
 * and a letter typed in between can be lost.
 *
 * This hook gives the box its own copy of the text, updated in the same
 * render as the box's own report, so the value the box sees is never behind
 * what was typed. The parent's value still wins whenever the parent changes
 * the text itself (clearing it after a send, a prompt put into the box, a
 * list number added after a new line): a parent value that is neither the
 * current text nor one this box reported and the parent has not caught up
 * with yet is taken as the parent setting the text.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Reports kept while the parent catches up (it is normally one behind) */
const MAX_PENDING = 20;

export function useEchoSafeText(
  value: string,
  onChangeText: (text: string) => void,
): [string, (text: string) => void] {
  const [text, setText] = useState(value);
  const textRef = useRef(value);
  // what this box reported that the parent has not passed back yet, oldest first
  const pendingRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChangeText);
  useLayoutEffect(() => {
    onChangeRef.current = onChangeText;
  });

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (value === textRef.current) {
      // the parent has caught up
      pendingRef.current = [];
      return;
    }
    const at = pending.indexOf(value);
    if (at >= 0) {
      // the parent passing back an earlier report: the box is already past it
      pendingRef.current = pending.slice(at + 1);
      return;
    }
    // the parent set the text itself
    pendingRef.current = [];
    textRef.current = value;
    setText(value);
  }, [value]);

  const handleChange = useCallback((next: string) => {
    textRef.current = next;
    const pending = pendingRef.current;
    pending.push(next);
    if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
    setText(next);
    onChangeRef.current(next);
  }, []);

  return [text, handleChange];
}
