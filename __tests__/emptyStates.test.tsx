import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptySpaceState } from '../components/spaces/EmptySpaceState';

jest.mock('lucide-react-native', () => ({
  Plus: () => null,
}));

describe('EmptySpaceState', () => {
  const defaultProps = {
    spaceName: 'Test Space',
    onAddPress: jest.fn(),
    onChatPress: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders with space name', () => {
    const { getByText } = render(<EmptySpaceState {...defaultProps} />);

    expect(getByText(/Test Space is empty/)).toBeTruthy();
  });

  it('calls onAddPress when add button pressed', () => {
    const { getByText } = render(<EmptySpaceState {...defaultProps} />);

    fireEvent.press(getByText('Add'));
    expect(defaultProps.onAddPress).toHaveBeenCalled();
  });

  it('calls onChatPress when link pressed', () => {
    const { getByText } = render(<EmptySpaceState {...defaultProps} />);

    fireEvent.press(getByText('Ask Gremly for ideas'));
    expect(defaultProps.onChatPress).toHaveBeenCalled();
  });

  it('shows add first step text', () => {
    const { getByText } = render(<EmptySpaceState {...defaultProps} />);

    expect(getByText(/add your first step/)).toBeTruthy();
  });
});
