import React from 'react';
import { render } from '@testing-library/react-native';
import { EmptySpaceState } from '../components/spaces/EmptySpaceState';

jest.mock('lucide-react-native', () => ({
  Compass: () => null,
}));

describe('EmptySpaceState', () => {
  const defaultProps = {
    spaceName: 'Test Space',
  };

  it('renders with space name', () => {
    const { getByText } = render(<EmptySpaceState {...defaultProps} />);

    expect(getByText(/Test Space is ready/)).toBeTruthy();
  });

  it('shows instructional text', () => {
    const { getByText } = render(<EmptySpaceState {...defaultProps} />);

    expect(getByText(/add your first item/)).toBeTruthy();
  });
});
