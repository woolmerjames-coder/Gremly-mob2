import React from 'react';

describe('Today V4 Lanes flag', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('renders TodayV4LanesView when v4Lanes is enabled', async () => {
    jest.doMock('../lib/env', () => ({
      env: {
        feature: {
          spaces: false,
          chat: false,
          unifiedOverlay: true,
          buddy: false,
          today: {
            v4Lanes: true,
            v3: false,
            focusCard: true,
            dropZone: true,
            sweepPreview: false,
            suggestions: false,
            celebration: false,
            eveningTeaser: false,
          },
          sweep: { eveningV1: false },
          mascot: { enabled: false, debug: false },
        },
      },
    }));

    const { renderWithProviders, screen } = await import('./utils/renderWithProviders');
    const { default: TodayScreen } = await import('../app/tabs/TodayScreen');

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('today-v4-lanes-screen')).toBeTruthy();
  });
});

describe('Today V3 fallback when v4Lanes is disabled', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('renders TodayV3View when v4Lanes is disabled and v3 is enabled', async () => {
    jest.doMock('../lib/env', () => ({
      env: {
        feature: {
          spaces: false,
          chat: false,
          unifiedOverlay: true,
          buddy: false,
          today: {
            v4Lanes: false,
            v3: true,
            focusCard: true,
            dropZone: true,
            sweepPreview: false,
            suggestions: false,
            celebration: false,
            eveningTeaser: false,
          },
          sweep: { eveningV1: false },
          mascot: { enabled: false, debug: false },
        },
      },
    }));

    const { renderWithProviders, screen } = await import('./utils/renderWithProviders');
    const { default: TodayScreen } = await import('../app/tabs/TodayScreen');

    renderWithProviders(<TodayScreen />);
    expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
  });
});
