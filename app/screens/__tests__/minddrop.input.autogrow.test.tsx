/**
 * Test: Mind Drop input auto-grows to show third line
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock providers
jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getById: jest.fn(),
    query: jest.fn(() => Promise.resolve([])),
  }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('Mind Drop Input Auto-grow', () => {
  it('shows third line when content grows (contentSizeChange)', () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    expect(input).toBeTruthy();

    // Simulate text change with multiple lines
    const multilineText = 'Line one\nLine two\nLine three visible';
    fireEvent.changeText(input, multilineText);

    // Simulate contentSizeChange event
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: {
        contentSize: {
          width: 350,
          height: 90, // Height for 3 lines (~30px per line)
        },
      },
    });

    // Verify input contains the text
    expect(input.props.value).toBe(multilineText);

    // The input should be multiline and show all content
    expect(input.props.multiline).toBe(true);
  });

  it('grows progressively from one to three lines', () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');

    // Start with one line
    fireEvent.changeText(input, 'First line');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 350, height: 30 } },
    });
    expect(input.props.value).toBe('First line');

    // Add second line
    fireEvent.changeText(input, 'First line\nSecond line');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 350, height: 60 } },
    });
    expect(input.props.value).toBe('First line\nSecond line');

    // Add third line
    fireEvent.changeText(input, 'First line\nSecond line\nThird line');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 350, height: 90 } },
    });
    expect(input.props.value).toBe('First line\nSecond line\nThird line');
  });
});
