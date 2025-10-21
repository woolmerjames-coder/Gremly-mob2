/**
 * MascotIcon Test
 * Ensures the mascot renders without crashing
 * SKIPPED: Requires react-native-reanimated mocking
 */

import React from 'react';
import { describe, test, expect } from '@jest/globals';
import { render } from '@testing-library/react-native';
import MascotIcon from '../components/MascotIcon';

describe.skip('MascotIcon', () => {
  test('mascot renders with default props', () => {
    const { getByLabelText } = render(<MascotIcon />);
    expect(getByLabelText('Gremly mascot')).toBeTruthy();
  });

  test('mascot renders with custom accessibility label', () => {
    const { getByLabelText } = render(<MascotIcon accessibilityLabel="Custom mascot label" />);
    expect(getByLabelText('Custom mascot label')).toBeTruthy();
  });

  test('mascot accepts different pose props', () => {
    const poses: Array<'neutral' | 'think' | 'celebrate' | 'default'> = [
      'neutral',
      'think',
      'celebrate',
      'default',
    ];

    poses.forEach((pose) => {
      const { getByLabelText } = render(<MascotIcon pose={pose} />);
      expect(getByLabelText('Gremly mascot')).toBeTruthy();
    });
  });

  test('mascot accepts custom size', () => {
    const { getByLabelText } = render(<MascotIcon size={128} />);
    expect(getByLabelText('Gremly mascot')).toBeTruthy();
  });
});
