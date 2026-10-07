/**
 * A stand in for the rich text editor in tests, where its native part is not
 * there. It is a plain text box: what is typed comes back as one paragraph
 * per line, and the formatting buttons are remembered so a test can see them.
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Text, TextInput } from 'react-native';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text: string) =>
  text.trim()
    ? `<html>${text
        .split('\n')
        .map((l) => (l.trim() ? `<p>${escape(l)}</p>` : '<br>'))
        .join('')}</html>`
    : '';

const toWords = (html: string) =>
  html
    .replace(/<\/(p|li)>|<br>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** Every formatting button pressed on any editor since the last clear */
export const pressedFormats: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EnrichedTextInput = forwardRef<any, any>(function EnrichedTextInput(props, ref) {
  const html = useRef<string>(props.defaultValue ?? '');
  const box = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({
    focus: () => box.current?.focus(),
    blur: () => box.current?.blur(),
    setValue: (value: string) => {
      html.current = value;
    },
    getHTML: async () => html.current,
    toggleBold: () => pressedFormats.push('bold'),
    toggleItalic: () => pressedFormats.push('italic'),
    toggleUnorderedList: () => pressedFormats.push('bullets'),
    toggleOrderedList: () => pressedFormats.push('numbers'),
  }));
  return (
    <TextInput
      ref={box}
      testID={props.testID}
      placeholder={props.placeholder}
      defaultValue={toWords(props.defaultValue ?? '')}
      editable={props.editable}
      multiline
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onChangeText={(text) => {
        html.current = toHtml(text);
        props.onChangeText?.({ nativeEvent: { value: text } });
      }}
    />
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EnrichedText(props: any) {
  return (
    <Text testID={props.testID} numberOfLines={props.numberOfLines}>
      {props.children}
    </Text>
  );
}
