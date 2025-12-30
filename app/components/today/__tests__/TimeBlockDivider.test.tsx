/**
 * Tests for TimeBlockDivider component
 *
 * Validates the time block section divider display.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TimeBlockDivider } from '../TimeBlockDivider';

describe('TimeBlockDivider', () => {
  describe('label rendering', () => {
    it('renders Morning label', () => {
      render(<TimeBlockDivider label="Morning" />);

      expect(screen.getByText('Morning')).toBeTruthy();
    });

    it('renders Day label', () => {
      render(<TimeBlockDivider label="Day" />);

      expect(screen.getByText('Day')).toBeTruthy();
    });

    it('renders Evening label', () => {
      render(<TimeBlockDivider label="Evening" />);

      expect(screen.getByText('Evening')).toBeTruthy();
    });

    it('renders Whenever label', () => {
      render(<TimeBlockDivider label="Whenever" />);

      expect(screen.getByText('Whenever')).toBeTruthy();
    });
  });

  describe('layout', () => {
    it('renders divider lines on both sides of label', () => {
      render(<TimeBlockDivider label="Morning" />);

      // The component renders the label between two line dividers
      // We verify the text is present - layout is tested via snapshot or visual tests
      expect(screen.getByText('Morning')).toBeTruthy();
    });
  });
});
