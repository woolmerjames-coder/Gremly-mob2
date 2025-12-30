/**
 * ShimmerPlaceholder Tests
 *
 * Tests for the animated skeleton placeholder with shimmer effect.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ShimmerPlaceholder } from '../ShimmerPlaceholder';

describe('ShimmerPlaceholder', () => {
  it('renders with specified dimensions', () => {
    const { toJSON } = render(<ShimmerPlaceholder width={200} height={20} />);

    const tree = toJSON();
    expect(tree).toBeTruthy();
    expect(tree?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 200, height: 20 })]),
    );
  });

  it('applies custom borderRadius', () => {
    const { toJSON } = render(<ShimmerPlaceholder width={100} height={16} borderRadius={8} />);

    const tree = toJSON();
    expect(tree).toBeTruthy();
    expect(tree?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderRadius: 8 })]),
    );
  });

  it('uses default borderRadius of 4 when not specified', () => {
    const { toJSON } = render(<ShimmerPlaceholder width={100} height={16} />);

    const tree = toJSON();
    expect(tree).toBeTruthy();
    expect(tree?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderRadius: 4 })]),
    );
  });

  it('accepts width as percentage string', () => {
    const { toJSON } = render(<ShimmerPlaceholder width="60%" height={14} />);

    const tree = toJSON();
    expect(tree).toBeTruthy();
    expect(tree?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '60%' })]),
    );
  });

  it('applies additional style props', () => {
    const customStyle = { marginTop: 8 };
    const { toJSON } = render(<ShimmerPlaceholder width={100} height={16} style={customStyle} />);

    const tree = toJSON();
    expect(tree).toBeTruthy();
    expect(tree?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ marginTop: 8 })]),
    );
  });

  it('renders shimmer gradient children', () => {
    const { toJSON } = render(<ShimmerPlaceholder width={100} height={16} />);

    const tree = toJSON();
    // Should have children for the shimmer effect
    expect(tree?.children).toBeTruthy();
    expect(tree?.children?.length).toBeGreaterThan(0);
  });
});
