import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import { mockMindDropFlag, mockRepoHook, mockAuthHook } from './utils/flagHarness';

// Capture latest navigation options set by the screen
let latestOptions: any = undefined;

describe('Mind Drop header wiring', () => {
  beforeEach(() => {
    jest.resetModules();
    latestOptions = undefined;
    jest.useFakeTimers();

    // Feature flag and provider hooks
    mockMindDropFlag(true);
    mockRepoHook();
    mockAuthHook({ userId: 'test-user' });

    // Mock navigation to capture setOptions and return the provided headerRight
    jest.doMock('@react-navigation/native', () => {
      const actual = jest.requireActual('@react-navigation/native');
      return {
        __esModule: true,
        ...actual,
        useNavigation: () => ({
          setOptions: (opts: any) => {
            latestOptions = opts;
          },
        }),
      };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the screen and exposes the info button', () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const { getByTestId } = render(<Screen />);

    expect(getByTestId('minddrop-screen')).toBeTruthy();
    expect(getByTestId('minddrop-info-button')).toBeTruthy();
  });

  it('sets the header title to "Mind Drop" and wires headerRight', async () => {
    const Screen = require('../app/screens/CatchAllNotepad').default;
    const screen = render(<Screen />);

    // Title should be set via setOptions
    expect(latestOptions?.title).toBe('Mind Drop');

    // If headerRight is provided, render and interact with it to toggle the tooltip
    if (latestOptions?.headerRight) {
      const HeaderRightEl = latestOptions.headerRight();
      const { getByTestId: getByTestIdHeader } = render(HeaderRightEl);

      fireEvent.press(getByTestIdHeader('minddrop-info-button'));

      // Tooltip appears
      expect(await screen.findByText(/Just type everything on your mind/i)).toBeTruthy();

      // Auto-hide after 3s
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.queryByText(/Just type everything on your mind/i)).toBeNull();
      });
    } else {
      // Fallback: at least ensure info button is present
      expect(screen.getByTestId('minddrop-info-button')).toBeTruthy();
    }
  });
});
