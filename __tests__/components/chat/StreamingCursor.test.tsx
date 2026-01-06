/**
 * Tests for StreamingCursor component - Premium "Breathing Orb"
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { InlineStreamingCursor } from '../../../components/chat/StreamingCursor';

// The global jest-setup.ts already mocks react-native-reanimated with cancelAnimation

describe('InlineStreamingCursor', () => {
  it('renders nothing when not visible', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={false} />);
    expect(toJSON()).toBeNull();
  });

  it('renders breathing orb with halo when visible', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('respects custom size prop', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} size={12} />);
    const tree = toJSON();
    // Container should be 2x the core size (halo size)
    expect(tree?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 24, // 2x core size for halo
          height: 24,
        }),
      ]),
    );
  });

  it('uses default size of 10', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    const tree = toJSON();
    // Container should be 20 (2x default size of 10)
    expect(tree?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 20,
          height: 20,
        }),
      ]),
    );
  });

  it('has two layers (halo and core)', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    const tree = toJSON();
    // Should have two children: halo and core
    expect(tree?.children?.length).toBe(2);
  });

  it('uses golden pear color for core and halo', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    const tree = toJSON();
    // Both children should have golden pear background
    const halo = tree?.children?.[0];
    const core = tree?.children?.[1];
    expect(halo?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: '#E0C47A',
        }),
      ]),
    );
    expect(core?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: '#E0C47A',
        }),
      ]),
    );
  });
});
