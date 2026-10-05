/**
 * The writing area of one journal card: rich text with bold, italics,
 * bullets and numbers. The page's format bar drives it through the handle.
 *
 * The editor keeps its own words. It is given words once, when it appears,
 * and asked for them when the page needs them, so typing never waits on the
 * rest of the screen. To show different words, give it a new key.
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type HtmlStyle,
  type OnChangeStateEvent,
  type OnChangeTextEvent,
} from 'react-native-enriched-html';
import { BRIEF } from '../brief/briefStyles';

export type FormatKind = 'bold' | 'italic' | 'bullets' | 'numbers';
export type FormatState = Record<FormatKind, boolean>;
export const NO_FORMAT: FormatState = {
  bold: false,
  italic: false,
  bullets: false,
  numbers: false,
};

export type JournalEditorHandle = {
  focus: () => void;
  blur: () => void;
  toggle: (kind: FormatKind) => void;
  /** The rich text as it stands now */
  html: () => Promise<string>;
};

export type JournalEditorProps = {
  /** The words to start with */
  initialHtml: string;
  placeholder: string;
  editable?: boolean;
  minHeight?: number;
  /** The font for the writing. Inter when left out. */
  fontFamily?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  /** The plain words, on every change */
  onChangeText?: (text: string) => void;
  /** Which of bold, italics, bullets and numbers apply where the cursor is */
  onFormat?: (state: FormatState) => void;
  testID?: string;
};

/** How lists look inside a card, shared by the editor and the read only text. */
export const JOURNAL_HTML_STYLE: HtmlStyle = {
  ul: { bulletColor: BRIEF.moss, bulletSize: 6, marginLeft: 6, gapWidth: 10 },
  ol: { markerColor: BRIEF.moss, markerFontWeight: '600', marginLeft: 6, gapWidth: 8 },
};

export const JOURNAL_TEXT = {
  fontFamily: 'Inter-Regular',
  fontSize: 16,
  lineHeight: 24,
  color: BRIEF.mossInk,
} as const;

export const JournalEditor = forwardRef<JournalEditorHandle, JournalEditorProps>(
  function JournalEditor(
    {
      initialHtml,
      placeholder,
      editable = true,
      minHeight = 44,
      fontFamily,
      onFocus,
      onBlur,
      onChangeText,
      onFormat,
      testID,
    },
    ref,
  ) {
    const input = useRef<EnrichedTextInputInstance | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => input.current?.focus(),
        blur: () => input.current?.blur(),
        toggle: (kind) => {
          const editor = input.current;
          if (!editor) return;
          if (kind === 'bold') editor.toggleBold();
          else if (kind === 'italic') editor.toggleItalic();
          else if (kind === 'bullets') editor.toggleUnorderedList();
          else editor.toggleOrderedList();
        },
        html: async () => (input.current ? input.current.getHTML() : initialHtml),
      }),
      [initialHtml],
    );

    return (
      <EnrichedTextInput
        ref={input}
        defaultValue={initialHtml || undefined}
        placeholder={placeholder}
        placeholderTextColor={BRIEF.faint}
        cursorColor={BRIEF.moss}
        selectionColor={BRIEF.sageWash}
        editable={editable}
        scrollEnabled={false}
        // a web address typed into a journal stays plain words
        linkRegex={null}
        htmlStyle={JOURNAL_HTML_STYLE}
        style={{ ...JOURNAL_TEXT, ...(fontFamily ? { fontFamily } : null), minHeight }}
        onFocus={onFocus}
        onBlur={onBlur}
        onChangeText={(e: NativeSyntheticEvent<OnChangeTextEvent>) =>
          onChangeText?.(e.nativeEvent.value)
        }
        onChangeState={(e: NativeSyntheticEvent<OnChangeStateEvent>) => {
          const s = e.nativeEvent;
          onFormat?.({
            bold: s.bold.isActive,
            italic: s.italic.isActive,
            bullets: s.unorderedList.isActive,
            numbers: s.orderedList.isActive,
          });
        }}
        testID={testID}
      />
    );
  },
);
