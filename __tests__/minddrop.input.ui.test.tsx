import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { mockMindDropFlag, mockRepoHook, mockAuthHook } from './utils/flagHarness';

// Navigation mock: avoid needing a NavigationContainer
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({ setOptions: () => {} }),
  };
});

describe.skip('Mind Drop input UI (P4 smoke + behavior)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockMindDropFlag(true);
    mockRepoHook();
    mockAuthHook({ userId: 'test-user' });
  });

  it('renders input container and input', () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);
    expect(getByTestId('minddrop-input-container')).toBeTruthy();
    expect(getByTestId('minddrop-input')).toBeTruthy();
  });

  it('toggles focus state without crashing', async () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);
    const input = getByTestId('minddrop-input');
    fireEvent(input, 'focus');
    // Optional: inspect style changes on container if desired
    fireEvent(input, 'blur');
  });

  it('updates character counter', () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);
    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, 'abc');
    expect(getByTestId('minddrop-counter').props.children).toContain('3 / 2000');
  });

  it('renders privacy badge', () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);
    expect(getByTestId('minddrop-privacy').props.children).toContain('Private & secure');
  });

  it('submit disabled when empty, enabled when non-empty', () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);
    const submit = getByTestId('minddrop-submit-button');
    const styleArray = Array.isArray(submit.props.style)
      ? submit.props.style
      : [submit.props.style];
    const baseStyle = styleArray[0] || {};
    expect(baseStyle.opacity).toBeCloseTo(0.6);

    const input = getByTestId('minddrop-input');
    fireEvent.changeText(input, 'hello');
    const submitEnabled = getByTestId('minddrop-submit-button');
    const enabledStyleArray = Array.isArray(submitEnabled.props.style)
      ? submitEnabled.props.style
      : [submitEnabled.props.style];
    const baseStyleEnabled = enabledStyleArray[0] || {};
    expect(baseStyleEnabled.opacity).toBe(1);
  });
});
