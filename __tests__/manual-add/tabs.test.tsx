import React from 'react';
import { renderWithProviders as render, fireEvent, screen } from '../utils/renderWithProviders';
import { Alert } from 'react-native';
// Mock safe-area to avoid requiring a provider in tests
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
import ManualAddSheet, { openManualAdd } from '../../components/ManualAddSheet';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock repo
const mockCreate = jest.fn();
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
  }),
}));

// Mock ActionSheet
jest.mock('react-native-actions-sheet', () => {
  const { useEffect, useRef } = require('react');
  function MockActionSheet({ children, onOpen }: any) {
    const hasOpenedRef = useRef(false);
    useEffect(() => {
      if (onOpen && !hasOpenedRef.current) {
        hasOpenedRef.current = true;
        onOpen();
      }
    }, [onOpen]);
    return <>{children}</>;
  }
  return {
    __esModule: true,
    default: MockActionSheet,
    SheetManager: {
      show: jest.fn((_sheetId: string) => {
        // Trigger re-render which will call onOpen
        return Promise.resolve();
      }),
      hide: jest.fn(),
    },
  };
});

describe('ManualAddSheet - Tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderSheet = () => {
    return render(<ManualAddSheet />);
  };

  it('renders the sheet with tabs visible', () => {
    renderSheet();
    openManualAdd();
    expect(screen.getByTestId('tab-habit')).toBeTruthy();
    expect(screen.getByTestId('tab-todo')).toBeTruthy();
    expect(screen.getByTestId('tab-journal')).toBeTruthy();
    expect(screen.getByTestId('tab-catchall')).toBeTruthy();
  });

  it('renders all four tab buttons', () => {
    openManualAdd();
    renderSheet();

    expect(screen.getByTestId('tab-habit')).toBeTruthy();
    expect(screen.getByTestId('tab-todo')).toBeTruthy();
    expect(screen.getByTestId('tab-journal')).toBeTruthy();
    expect(screen.getByTestId('tab-catchall')).toBeTruthy();
  });

  it('switches to habit tab and shows habit name input', () => {
    openManualAdd({ defaultTab: 'habit' });
    renderSheet();

    fireEvent.press(screen.getByTestId('tab-habit'));
    expect(screen.getByTestId('habit-name')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g., Morning run')).toBeTruthy();
  });

  it('switches to todo tab and shows todo-name input', () => {
    openManualAdd({ defaultTab: 'todo' });
    renderSheet();

    fireEvent.press(screen.getByTestId('tab-todo'));
    expect(screen.getByTestId('todo-name')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g., Buy groceries')).toBeTruthy();
  });

  it('switches to journal tab and shows journal-body input', () => {
    openManualAdd({ defaultTab: 'journal' });
    renderSheet();

    fireEvent.press(screen.getByTestId('tab-journal'));
    expect(screen.getByTestId('journal-body')).toBeTruthy();
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeTruthy();
  });

  it('switches to catchall tab and shows catchall-body input', () => {
    openManualAdd({ defaultTab: 'catchall' });
    renderSheet();

    fireEvent.press(screen.getByTestId('tab-catchall'));
    expect(screen.getByTestId('catchall-body')).toBeTruthy();
    expect(screen.getByPlaceholderText('Quick note or idea...')).toBeTruthy();
  });

  it('renders save button', () => {
    openManualAdd();
    renderSheet();

    expect(screen.getByTestId('button-save')).toBeTruthy();
    expect(screen.getByText('Save to The Hub')).toBeTruthy();
  });
});
