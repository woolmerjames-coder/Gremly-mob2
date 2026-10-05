/**
 * The sheet for a page of the person's own (components/journal/JournalOwnPageSheet):
 * naming it, writing its questions, Save, and Delete on one already kept.
 */
import React from 'react';
import { Animated } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { JournalOwnPageSheet, type JournalOwnPageSheetProps } from '../JournalOwnPageSheet';
import type { OwnPageForm } from '../../../lib/journal/ownPages';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

function open(props: Partial<JournalOwnPageSheetProps> = {}) {
  const onSave = jest.fn(
    async (_form: OwnPageForm, _reworded: Record<string, string>) => ({ ok: true }) as const,
  );
  const onClose = jest.fn();
  const utils = render(
    <JournalOwnPageSheet
      initial={{ name: '', prompts: [] }}
      lift={new Animated.Value(0)}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  const questions = () =>
    utils.queryAllByTestId(/^journal-own-question-\d+$/).map((q) => q.props.value);
  const press = async (testID: string) => {
    await act(async () => {
      fireEvent.press(utils.getByTestId(testID));
    });
  };
  return { ...utils, onSave, onClose, questions, press };
}

describe('a new page', () => {
  it('starts with room for three questions and no way to delete', () => {
    const { getByText, questions, queryByTestId } = open();
    expect(getByText('Make your own page')).toBeTruthy();
    expect(getByText('Save page')).toBeTruthy();
    expect(questions()).toEqual(['', '', '']);
    expect(queryByTestId('journal-own-delete')).toBeNull();
  });

  it('hands over the name and the questions as typed', async () => {
    const { getByTestId, press, onSave } = open();
    fireEvent.changeText(getByTestId('journal-own-name'), 'Sunday reset');
    fireEvent.changeText(getByTestId('journal-own-question-0'), 'What went well?');
    fireEvent.changeText(getByTestId('journal-own-question-2'), 'What next?');
    await press('journal-own-save');
    expect(onSave).toHaveBeenCalledWith(
      { id: null, name: 'Sunday reset', prompts: ['What went well?', '', 'What next?'] },
      {},
    );
  });

  it('asks for a question, and saves nothing, when none is written', async () => {
    const { getByTestId, press, onSave, queryByTestId } = open();
    fireEvent.changeText(getByTestId('journal-own-name'), 'Sunday reset');
    await press('journal-own-save');
    expect(getByTestId('journal-own-error').props.children).toBe('Add at least one question');
    expect(onSave).not.toHaveBeenCalled();
    // typing a question clears it
    fireEvent.changeText(getByTestId('journal-own-question-0'), 'What went well?');
    expect(queryByTestId('journal-own-error')).toBeNull();
  });

  it('has room for six questions, and always keeps one row', async () => {
    const { press, questions, queryByTestId, getByTestId } = open();
    await press('journal-own-add-question');
    await press('journal-own-add-question');
    await press('journal-own-add-question');
    expect(questions()).toHaveLength(6);
    expect(queryByTestId('journal-own-add-question')).toBeNull();

    fireEvent.changeText(getByTestId('journal-own-question-1'), 'Second');
    await press('journal-own-question-0-remove');
    // the others keep their words and move up
    expect(questions()).toEqual(['Second', '', '', '', '']);
    for (let i = 0; i < 4; i += 1) await press('journal-own-question-0-remove');
    expect(questions()).toEqual(['']);
    expect(queryByTestId('journal-own-question-0-remove')).toBeNull();
  });

  it('stays up with the reason when the page could not be kept', async () => {
    const onSave = jest.fn(
      async () => ({ ok: false, message: 'Your page was not saved.' }) as const,
    );
    const { getByTestId, press } = open({ onSave });
    fireEvent.changeText(getByTestId('journal-own-question-0'), 'What went well?');
    await press('journal-own-save');
    expect(getByTestId('journal-own-error').props.children).toBe('Your page was not saved.');
  });

  it('closes without saving from outside the sheet', async () => {
    const { press, onClose, onSave } = open();
    await press('journal-own-close');
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('the prompts on the page, kept as a page', () => {
  it('starts with those prompts as its questions', () => {
    const { questions } = open({
      initial: { name: '', prompts: ['What went well?', 'What next?'] },
    });
    expect(questions()).toEqual(['What went well?', 'What next?']);
  });
});

describe('a page that is already kept', () => {
  const initial = { id: 'p1', name: 'Sunday reset', prompts: ['What went well?'] };

  it('shows its name and questions, to change', async () => {
    const { getByText, getByTestId, questions, press, onSave } = open({ initial });
    expect(getByText('Your page')).toBeTruthy();
    expect(getByTestId('journal-own-name').props.value).toBe('Sunday reset');
    expect(questions()).toEqual(['What went well?']);
    fireEvent.changeText(getByTestId('journal-own-name'), 'Sunday');
    await press('journal-own-save');
    expect(getByText('Save changes')).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith(
      { id: 'p1', name: 'Sunday', prompts: ['What went well?'] },
      {},
    );
  });

  it('says which questions were reworded, so answers can stay with them', async () => {
    const { getByTestId, press, onSave } = open({
      initial: { id: 'p1', name: 'Sunday reset', prompts: ['What went well?', 'What next?'] },
    });
    fireEvent.changeText(getByTestId('journal-own-question-0'), ' What went right? ');
    await press('journal-own-add-question');
    fireEvent.changeText(getByTestId('journal-own-question-2'), 'What do I drop?');
    await press('journal-own-save');
    // the one left alone and the one added are not rewordings
    expect(onSave.mock.calls[0][1]).toEqual({ 'What went well?': 'What went right?' });
  });

  it('does not count a question taken out, or emptied, as reworded', async () => {
    const { getByTestId, press, onSave } = open({
      initial: { id: 'p1', name: 'Sunday reset', prompts: ['A', 'B', 'C'] },
    });
    await press('journal-own-question-0-remove');
    fireEvent.changeText(getByTestId('journal-own-question-0'), '');
    await press('journal-own-save');
    expect(onSave.mock.calls[0]).toEqual([
      { id: 'p1', name: 'Sunday reset', prompts: ['', 'C'] },
      {},
    ]);
  });

  it('can be deleted', async () => {
    const onDelete = jest.fn();
    const { press } = open({ initial, onDelete });
    await press('journal-own-delete');
    expect(onDelete).toHaveBeenCalled();
  });
});
