/**
 * One tap opens the item a card shows: a todo or note in the edit overlay, a
 * habit on its own page. From a chat that sits on an overlay, the overlay is
 * closed first for a habit, or its page would open behind it.
 */
import { renderHook } from '@testing-library/react-native';
import { useOpenEntity } from '../useOpenEntity';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
const mockOverlay = { state: { visible: false }, openEdit: jest.fn(), close: jest.fn() };
jest.mock('../useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => mockOverlay,
}));
jest.mock('../../lib/store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({ todos: [{ id: 't1', name: 'Call the vet' }], notes: [] }),
  },
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockOverlay.state = { visible: false };
});
afterEach(() => jest.useRealTimers());

describe('useOpenEntity', () => {
  it('opens a todo in the edit overlay, with the record the store has', () => {
    const open = renderHook(() => useOpenEntity()).result.current;
    open({ id: 't1', type: 'todo', title: 'Call the vet' });
    expect(mockOverlay.openEdit).toHaveBeenCalledWith({
      record: { id: 't1', name: 'Call the vet', type: 'todo' },
      spaceId: undefined,
    });
  });

  it("opens a habit's own page", () => {
    const open = renderHook(() => useOpenEntity()).result.current;
    open({ id: 'h1', type: 'habit', title: 'Run' });
    expect(mockNavigate).toHaveBeenCalledWith('HabitDetail', { habitId: 'h1' });
    expect(mockOverlay.close).not.toHaveBeenCalled();
  });

  it('closes the overlay first when the tap came from a chat on top of it', () => {
    mockOverlay.state = { visible: true };
    const open = renderHook(() => useOpenEntity()).result.current;
    open({ id: 'h1', type: 'habit', title: 'Run' }, { overOverlay: true });
    expect(mockOverlay.close).toHaveBeenCalledTimes(1);
    // the page opens once the overlay has had time to go
    expect(mockNavigate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(mockNavigate).toHaveBeenCalledWith('HabitDetail', { habitId: 'h1' });
  });

  it('leaves an overlay alone when the tap did not come from on top of it, or none is open', () => {
    mockOverlay.state = { visible: true };
    const open = renderHook(() => useOpenEntity()).result.current;
    open({ id: 'h1', type: 'habit', title: 'Run' });
    expect(mockOverlay.close).not.toHaveBeenCalled();
    mockOverlay.state = { visible: false };
    const again = renderHook(() => useOpenEntity()).result.current;
    again({ id: 'h1', type: 'habit', title: 'Run' }, { overOverlay: true });
    expect(mockOverlay.close).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
