/**
 * Tests for StreamingCursor component
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

  it('renders a pulsing dot when visible', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('respects custom size prop', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} size={10} />);
    const tree = toJSON();
    // Should have width/height of 10
    expect(tree?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 10,
          height: 10,
          borderRadius: 5, // half of size
        }),
      ]),
    );
  });

  it('uses default size of 6', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    const tree = toJSON();
    expect(tree?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 6,
          height: 6,
          borderRadius: 3,
        }),
      ]),
    );
  });

  it('uses golden pear color', () => {
    const { toJSON } = render(<InlineStreamingCursor visible={true} />);
    const tree = toJSON();
    expect(tree?.props?.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: '#E0C47A',
        }),
      ]),
    );
  });
});
