import React from 'react';
import { render } from '@testing-library/react-native';
import { MidConfidenceChips, type UISuggestion } from '../MidConfidenceChips';
import { env } from '../../../../lib/env';

describe('MidConfidenceChips canonical labels', () => {
  const journalSuggestion: UISuggestion = {
    type: 'create.note',
    label: 'Save as note',
    payload: {
      title: 'Journal entry',
      body: 'Journal entry',
      subtype: 'journal',
    },
  };

  const listSuggestion: UISuggestion = {
    type: 'create.note',
    label: 'Save as list',
    payload: {
      title: 'Trip packing list',
      body: 'Trip packing list',
      subtype: 'list',
    },
  };

  const noop = () => {};
  let originalFlag: boolean;
  let originalConversionsFlag: boolean;

  beforeEach(() => {
    originalFlag = env.feature.canonicalTypes;
    originalConversionsFlag = env.feature.canonicalConversions;
  });

  afterEach(() => {
    (env.feature as any).canonicalTypes = originalFlag;
    (env.feature as any).canonicalConversions = originalConversionsFlag;
  });

  it('renders canonical log label when enabled', () => {
    (env.feature as any).canonicalTypes = true;
    const { getByText } = render(
      <MidConfidenceChips suggestions={[journalSuggestion]} onPick={noop} />,
    );
    expect(getByText('Save as log')).toBeTruthy();
  });

  it('falls back to note label when canonical types are disabled', () => {
    (env.feature as any).canonicalTypes = false;
    const { getByText } = render(
      <MidConfidenceChips suggestions={[journalSuggestion]} onPick={noop} />,
    );
    expect(getByText('Save as note')).toBeTruthy();
  });

  it('keeps list label regardless of canonical flag', () => {
    (env.feature as any).canonicalTypes = true;
    const { getByText } = render(
      <MidConfidenceChips suggestions={[listSuggestion]} onPick={noop} />,
    );
    expect(getByText('Save as list')).toBeTruthy();
  });

  it('hides conversion chip when canonical conversions flag is off', () => {
    (env.feature as any).canonicalConversions = false;
    const conversionSuggestion: UISuggestion = {
      type: 'convert.log-list-to-todo',
      label: 'Convert to to-do',
      payload: { noteId: 'note-1' },
    };

    const { queryByText } = render(
      <MidConfidenceChips suggestions={[conversionSuggestion]} onPick={noop} />,
    );

    expect(queryByText('Convert to to-do')).toBeNull();
  });

  it('shows conversion chip when canonical conversions flag is on', () => {
    (env.feature as any).canonicalConversions = true;
    const conversionSuggestion: UISuggestion = {
      type: 'convert.log-list-to-todo',
      label: 'Convert to to-do',
      payload: { noteId: 'note-1' },
    };

    const { getByText } = render(
      <MidConfidenceChips suggestions={[conversionSuggestion]} onPick={noop} />,
    );

    expect(getByText('Convert to to-do')).toBeTruthy();
  });
});
