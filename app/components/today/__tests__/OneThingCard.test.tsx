/**
 * Tests for OneThingCard component
 *
 * Validates the "One Thing" anchor task display card functionality.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OneThingCard } from '../OneThingCard';

describe('OneThingCard', () => {
  const defaultProps = {
    title: 'Review project proposal',
    type: 'todo' as const,
  };

  describe('rendering', () => {
    it('renders the title', () => {
      render(<OneThingCard {...defaultProps} />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders "Your One Thing" label', () => {
      render(<OneThingCard {...defaultProps} />);

      expect(screen.getByText('Your One Thing')).toBeTruthy();
    });

    it('renders Gremly encouragement text', () => {
      render(<OneThingCard {...defaultProps} />);

      expect(screen.getByText('This is the one.')).toBeTruthy();
    });

    it('has correct testID for card', () => {
      render(<OneThingCard {...defaultProps} />);

      expect(screen.getByTestId('one-thing-card')).toBeTruthy();
    });

    it('has correct accessibility label', () => {
      render(<OneThingCard {...defaultProps} />);

      expect(screen.getByLabelText('Your one thing: Review project proposal')).toBeTruthy();
    });
  });

  describe('type prop', () => {
    it('renders with todo type', () => {
      render(<OneThingCard {...defaultProps} type="todo" />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });

    it('renders with habit type', () => {
      render(<OneThingCard {...defaultProps} type="habit" />);

      expect(screen.getByText('Review project proposal')).toBeTruthy();
    });
  });

  describe('onPress', () => {
    it('calls onPress when card is pressed', () => {
      const onPress = jest.fn();
      render(<OneThingCard {...defaultProps} onPress={onPress} />);

      fireEvent.press(screen.getByTestId('one-thing-card'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not crash when onPress is not provided', () => {
      render(<OneThingCard {...defaultProps} />);

      // Should not throw
      fireEvent.press(screen.getByTestId('one-thing-card'));
    });
  });

  describe('onChangePress', () => {
    it('shows Change link when onChangePress is provided', () => {
      const onChangePress = jest.fn();
      render(<OneThingCard {...defaultProps} onChangePress={onChangePress} />);

      expect(screen.getByText('Change')).toBeTruthy();
      expect(screen.getByTestId('one-thing-change')).toBeTruthy();
    });

    it('hides Change link when onChangePress is not provided', () => {
      render(<OneThingCard {...defaultProps} />);

      expect(screen.queryByText('Change')).toBeNull();
      expect(screen.queryByTestId('one-thing-change')).toBeNull();
    });

    it('calls onChangePress when Change link is pressed', () => {
      const onChangePress = jest.fn();
      render(<OneThingCard {...defaultProps} onChangePress={onChangePress} />);

      fireEvent.press(screen.getByTestId('one-thing-change'));

      expect(onChangePress).toHaveBeenCalledTimes(1);
    });
  });

  describe('title display', () => {
    it('renders long titles', () => {
      const longTitle =
        'This is a very long task title that might need to be truncated on the display';
      render(<OneThingCard {...defaultProps} title={longTitle} />);

      expect(screen.getByText(longTitle)).toBeTruthy();
    });

    it('renders short titles', () => {
      render(<OneThingCard {...defaultProps} title="Short" />);

      expect(screen.getByText('Short')).toBeTruthy();
    });

    it('renders titles with special characters', () => {
      const specialTitle = 'Review & approve budget (Q1 2025)';
      render(<OneThingCard {...defaultProps} title={specialTitle} />);

      expect(screen.getByText(specialTitle)).toBeTruthy();
    });
  });
});
