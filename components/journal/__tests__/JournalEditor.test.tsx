/**
 * The journal card's writing area and the format bar above the keyboard
 * (components/journal). The editor's native part is not there in tests, so
 * these check what the app's own code does around it.
 */
import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  JournalEditor,
  NO_FORMAT,
  type FormatKind,
  type JournalEditorHandle,
} from '../JournalEditor';
import { JournalFormatBar } from '../JournalFormatBar';
import { JournalRichText } from '../JournalRichText';

jest.mock('react-native-enriched-html');

// the stand in editor remembers which formatting buttons were pressed
const { pressedFormats } = jest.requireMock('react-native-enriched-html') as {
  pressedFormats: string[];
};

beforeEach(() => {
  pressedFormats.length = 0;
});

describe('the writing area', () => {
  it('starts with the words it is given and hands them back', async () => {
    const ref = createRef<JournalEditorHandle>();
    render(
      <JournalEditor
        ref={ref}
        initialHtml="<html><p>Tired.</p></html>"
        placeholder="Write here..."
      />,
    );
    await expect(ref.current?.html()).resolves.toBe('<html><p>Tired.</p></html>');
  });

  it('tells the page the plain words as they are typed', () => {
    const onChangeText = jest.fn();
    const { getByTestId } = render(
      <JournalEditor
        initialHtml=""
        placeholder="Write here..."
        onChangeText={onChangeText}
        testID="editor"
      />,
    );
    fireEvent.changeText(getByTestId('editor'), 'A good day.');
    expect(onChangeText).toHaveBeenLastCalledWith('A good day.');
  });

  it('hands back what was typed since', async () => {
    const ref = createRef<JournalEditorHandle>();
    const { getByTestId } = render(
      <JournalEditor ref={ref} initialHtml="" placeholder="Write here..." testID="editor" />,
    );
    fireEvent.changeText(getByTestId('editor'), 'One\nTwo');
    await expect(ref.current?.html()).resolves.toBe('<html><p>One</p><p>Two</p></html>');
  });

  it('passes each format on to the editor', () => {
    const ref = createRef<JournalEditorHandle>();
    render(<JournalEditor ref={ref} initialHtml="" placeholder="Write here..." />);
    act(() => {
      for (const kind of ['bold', 'italic', 'bullets', 'numbers'] as FormatKind[]) {
        ref.current?.toggle(kind);
      }
    });
    expect(pressedFormats).toEqual(['bold', 'italic', 'bullets', 'numbers']);
  });

  it('shows its placeholder', () => {
    const { getByPlaceholderText } = render(
      <JournalEditor initialHtml="" placeholder="Anything else..." />,
    );
    expect(getByPlaceholderText('Anything else...')).toBeTruthy();
  });
});

describe('the format bar', () => {
  it('has a named button for each format and says how much is written', () => {
    const { getByLabelText, getByTestId } = render(
      <JournalFormatBar state={NO_FORMAT} onToggle={() => {}} count="16 words" />,
    );
    for (const label of ['Bold', 'Italic', 'Bulleted list', 'Numbered list']) {
      expect(getByLabelText(label)).toBeTruthy();
    }
    expect(getByTestId('journal-format-count').props.children).toBe('16 words');
  });

  it('asks for the format that was tapped', () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <JournalFormatBar state={NO_FORMAT} onToggle={onToggle} count="" />,
    );
    fireEvent.press(getByTestId('journal-format-bullets'));
    expect(onToggle).toHaveBeenCalledWith('bullets');
  });

  it('marks the formats that apply where the cursor is', () => {
    const { getByTestId } = render(
      <JournalFormatBar state={{ ...NO_FORMAT, bold: true }} onToggle={() => {}} count="" />,
    );
    expect(getByTestId('journal-format-bold').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('journal-format-italic').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('offers a photo only when photos can be added', () => {
    const onPhoto = jest.fn();
    const without = render(<JournalFormatBar state={NO_FORMAT} onToggle={() => {}} count="" />);
    expect(without.queryByTestId('journal-format-photo')).toBeNull();
    const withPhoto = render(
      <JournalFormatBar state={NO_FORMAT} onToggle={() => {}} onPhoto={onPhoto} count="" />,
    );
    fireEvent.press(withPhoto.getByTestId('journal-format-photo'));
    expect(onPhoto).toHaveBeenCalled();
  });
});

describe('words shown to read', () => {
  it('are given to the reader as they were written', () => {
    const { getByTestId } = render(
      <JournalRichText html="<html><p>Tired.</p></html>" testID="read" />,
    );
    expect(getByTestId('read').props.children).toBe('<html><p>Tired.</p></html>');
  });
});
