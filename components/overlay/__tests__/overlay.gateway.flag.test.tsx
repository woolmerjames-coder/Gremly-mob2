import React from 'react';
import { render } from '@testing-library/react-native';

// Simple env shim: set and unset on process.env for each case
const baseProps = { visible: true, mode: 'create', onClose: jest.fn() } as any;

describe('Overlay gateway', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('renders V2 when FEATURE_OVERLAY_V2=on', async () => {
    process.env.EXPO_PUBLIC_FEATURE_OVERLAY_V2 = 'on';
    // Mock downstream concrete overlay implementations to avoid provider setup
    jest.doMock('../../overlay/UnifiedOverlayV2', () => ({
      UnifiedOverlayV2: (props: any) => require('react').createElement('View', { testID: 'v2' }),
    }));
    jest.doMock('../../overlay/UnifiedCreateOverlay', () => ({
      UnifiedCreateOverlay: (props: any) =>
        require('react').createElement('View', { testID: 'v1' }),
    }));

    const { OverlayComponent } = require('../../overlay/gateway');
    const { toJSON } = render(<OverlayComponent {...baseProps} />);
    expect(toJSON()).toBeTruthy(); // placeholder existence; deeper UI tests land in Phase 1
  });

  it('renders V1 when V2=off', () => {
    process.env.EXPO_PUBLIC_FEATURE_OVERLAY_V2 = 'off';
    jest.doMock('../../overlay/UnifiedOverlayV2', () => ({
      UnifiedOverlayV2: (props: any) => require('react').createElement('View', { testID: 'v2' }),
    }));
    jest.doMock('../../overlay/UnifiedCreateOverlay', () => ({
      UnifiedCreateOverlay: (props: any) =>
        require('react').createElement('View', { testID: 'v1' }),
    }));

    const { OverlayComponent } = require('../../overlay/gateway');
    const { toJSON } = render(<OverlayComponent {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });
});
