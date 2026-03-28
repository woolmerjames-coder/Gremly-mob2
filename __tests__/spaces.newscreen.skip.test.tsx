/**
 * SKIPPED TEST - NewSpaceScreen.legacy removed in Phase H
 *
 * NewSpace functionality now uses NewSpaceModal component instead of a screen route.
 * This test is preserved for reference but no longer runs.
 */

test.skip('NewSpaceScreen tests skipped - screen removed in Phase H', () => {
  // All tests for NewSpaceScreen.legacy have been skipped
  // NewSpace functionality now uses components/NewSpaceModal.tsx
});

/*
import { render, fireEvent } from '@testing-library/react-native';
import NewSpaceScreen from '../app/screens/NewSpaceScreen.legacy';

// Mock dependencies
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    createSpace: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    replace: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test('create disabled until name typed', () => {
  const { getByLabelText } = render(<NewSpaceScreen />);
  const create = getByLabelText('Create Space');

  // Should be disabled initially
  expect(create.props.accessibilityState?.disabled ?? create.props.disabled).toBeTruthy();

  const nameInput = getByLabelText('Space name');
  fireEvent.changeText(nameInput, 'Work');

  // Re-query to get updated button state
  const create2 = getByLabelText('Create Space');
  expect(create2.props.accessibilityState?.disabled ?? create2.props.disabled).toBeFalsy();
});
*/
