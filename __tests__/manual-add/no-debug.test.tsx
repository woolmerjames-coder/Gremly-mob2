import { render } from '@testing-library/react-native';
import ManualAddSheet from '../../components/ManualAddSheet';

// Mock repo provider to avoid pulling expo env in tests
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({ create: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('no debug text', () => {
  it('does not render DEBUG overlays', () => {
    const { queryByText } = render(<ManualAddSheet />);
    expect(queryByText(/DEBUG/i)).toBeNull();
  });
});
