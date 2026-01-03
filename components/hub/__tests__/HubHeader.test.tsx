/**
 * Tests for components/hub/HubHeader.tsx
 * Tests the Hub header component with search, filters, and settings button
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HubHeader, {
  type HubHeaderProps,
  type HubV1View,
  type HubV1TimeRange,
  type HubV1StatusFilter,
  type HubV1TypeFilter,
} from '../HubHeader';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const defaultProps: HubHeaderProps = {
  search: '',
  onSearchChange: jest.fn(),
  hubView: 'all',
  onViewChange: jest.fn(),
  selectedTypes: new Set<HubV1TypeFilter>(),
  onTypeToggle: jest.fn(),
  timeRange: 'week',
  onTimeRangeChange: jest.fn(),
  status: 'active',
  onStatusChange: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('HubHeader', () => {
  describe('rendering', () => {
    it('renders the header title', () => {
      const { getByText } = render(<HubHeader {...defaultProps} />);
      expect(getByText('Hub')).toBeTruthy();
    });

    it('renders the search input', () => {
      const { getByTestId } = render(<HubHeader {...defaultProps} />);
      expect(getByTestId('hub-search')).toBeTruthy();
    });

    it('renders the view toggle', () => {
      const { getByTestId } = render(<HubHeader {...defaultProps} />);
      expect(getByTestId('hub-view-toggle')).toBeTruthy();
    });

    it('renders All Items and Journals view options', () => {
      const { getByText } = render(<HubHeader {...defaultProps} />);
      expect(getByText('All Items')).toBeTruthy();
      expect(getByText('Journals')).toBeTruthy();
    });
  });

  describe('settings button', () => {
    it('does not render settings button when onSettingsPress is not provided', () => {
      const { queryByTestId } = render(<HubHeader {...defaultProps} />);
      expect(queryByTestId('hub-settings-button')).toBeNull();
    });

    it('renders settings button when onSettingsPress is provided', () => {
      const onSettingsPress = jest.fn();
      const { getByTestId } = render(
        <HubHeader {...defaultProps} onSettingsPress={onSettingsPress} />,
      );
      expect(getByTestId('hub-settings-button')).toBeTruthy();
    });

    it('calls onSettingsPress when settings button is pressed', () => {
      const onSettingsPress = jest.fn();
      const { getByTestId } = render(
        <HubHeader {...defaultProps} onSettingsPress={onSettingsPress} />,
      );

      fireEvent.press(getByTestId('hub-settings-button'));

      expect(onSettingsPress).toHaveBeenCalledTimes(1);
    });

    it('settings button has correct accessibility properties', () => {
      const onSettingsPress = jest.fn();
      const { getByTestId } = render(
        <HubHeader {...defaultProps} onSettingsPress={onSettingsPress} />,
      );

      const settingsButton = getByTestId('hub-settings-button');
      expect(settingsButton.props.accessibilityLabel).toBe('Settings');
      expect(settingsButton.props.accessibilityRole).toBe('button');
    });
  });

  describe('search functionality', () => {
    it('displays current search value', () => {
      const { getByTestId } = render(<HubHeader {...defaultProps} search="test query" />);
      const searchInput = getByTestId('hub-search');
      expect(searchInput.props.value).toBe('test query');
    });

    it('calls onSearchChange when text is entered', () => {
      const onSearchChange = jest.fn();
      const { getByTestId } = render(
        <HubHeader {...defaultProps} onSearchChange={onSearchChange} />,
      );

      fireEvent.changeText(getByTestId('hub-search'), 'new search');

      expect(onSearchChange).toHaveBeenCalledWith('new search');
    });

    it('has correct placeholder text', () => {
      const { getByTestId } = render(<HubHeader {...defaultProps} />);
      const searchInput = getByTestId('hub-search');
      expect(searchInput.props.placeholder).toBe('Search your mind...');
    });
  });

  describe('view toggle', () => {
    it('calls onViewChange when All Items is pressed', () => {
      const onViewChange = jest.fn();
      const { getByTestId } = render(
        <HubHeader {...defaultProps} hubView="journals" onViewChange={onViewChange} />,
      );

      fireEvent.press(getByTestId('hub-view-toggle-all'));

      expect(onViewChange).toHaveBeenCalledWith('all');
    });

    it('calls onViewChange when Journals is pressed', () => {
      const onViewChange = jest.fn();
      const { getByTestId } = render(
        <HubHeader {...defaultProps} hubView="all" onViewChange={onViewChange} />,
      );

      fireEvent.press(getByTestId('hub-view-toggle-journals'));

      expect(onViewChange).toHaveBeenCalledWith('journals');
    });

    it('has correct accessibility state for selected view', () => {
      const { getByTestId } = render(<HubHeader {...defaultProps} hubView="all" />);

      const allTab = getByTestId('hub-view-toggle-all');
      const journalsTab = getByTestId('hub-view-toggle-journals');

      expect(allTab.props.accessibilityState.selected).toBe(true);
      expect(journalsTab.props.accessibilityState.selected).toBe(false);
    });

    it('updates selected state when view changes', () => {
      const { getByTestId, rerender } = render(<HubHeader {...defaultProps} hubView="all" />);

      let allTab = getByTestId('hub-view-toggle-all');
      let journalsTab = getByTestId('hub-view-toggle-journals');

      expect(allTab.props.accessibilityState.selected).toBe(true);
      expect(journalsTab.props.accessibilityState.selected).toBe(false);

      // Rerender with journals view
      rerender(<HubHeader {...defaultProps} hubView="journals" />);

      allTab = getByTestId('hub-view-toggle-all');
      journalsTab = getByTestId('hub-view-toggle-journals');

      expect(allTab.props.accessibilityState.selected).toBe(false);
      expect(journalsTab.props.accessibilityState.selected).toBe(true);
    });
  });
});
