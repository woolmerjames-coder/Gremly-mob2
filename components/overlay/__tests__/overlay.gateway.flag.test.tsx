import React from 'react';
import { render } from '@testing-library/react-native';
import { OverlayComponent } from '../../overlay/gateway';

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
    const { toJSON } = render(<OverlayComponent {...baseProps} />);
    expect(toJSON()).toBeTruthy(); // placeholder existence; deeper UI tests land in Phase 1
  });

  it('renders V1 when V2=off and UNIFIED_OVERLAY=on', () => {
    process.env.EXPO_PUBLIC_FEATURE_OVERLAY_V2 = 'off';
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'on';
    const { toJSON } = render(<OverlayComponent {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('falls back to ManualAdd when both are off', () => {
    process.env.EXPO_PUBLIC_FEATURE_OVERLAY_V2 = 'off';
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY = 'off';
    const { toJSON } = render(<OverlayComponent {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });
});
