/**
 * Tests for useOverwhelmFlow hook
 */

import { renderHook, act } from '@testing-library/react-native';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import * as CortexClient from '../../lib/cortex/CortexClient';

// Mock the CortexClient
jest.mock('../../lib/cortex/CortexClient', () => ({
  callChat: jest.fn(),
}));

describe('useOverwhelmFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    expect(result.current.step).toBe('idle');
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.plan).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('opens to select step', () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    act(() => {
      result.current.open();
    });

    expect(result.current.step).toBe('select');
    expect(result.current.selectedIds).toEqual([]);
  });

  it('closes and resets state', () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    act(() => {
      result.current.open();
      result.current.toggleSelection('item-1');
    });

    expect(result.current.selectedIds).toEqual(['item-1']);

    act(() => {
      result.current.close();
    });

    expect(result.current.step).toBe('idle');
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.plan).toBeNull();
  });

  it('toggles item selection', () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    act(() => {
      result.current.toggleSelection('item-1');
    });
    expect(result.current.selectedIds).toEqual(['item-1']);

    act(() => {
      result.current.toggleSelection('item-2');
    });
    expect(result.current.selectedIds).toEqual(['item-1', 'item-2']);

    act(() => {
      result.current.toggleSelection('item-1');
    });
    expect(result.current.selectedIds).toEqual(['item-2']);
  });

  it('requests plan with AI success', async () => {
    const mockResponse = {
      ok: true,
      data: JSON.stringify([
        {
          itemId: 'habit-1',
          title: 'Morning Meditation',
          steps: ['Find a quiet spot', 'Set a timer for 5 minutes', 'Start breathing'],
          encouragement: 'Small steps lead to big changes!',
        },
      ]),
    };

    (CortexClient.callChat as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useOverwhelmFlow());

    await act(async () => {
      await result.current.requestPlan([{ id: 'habit-1', title: 'Morning Meditation' }]);
    });

    expect(result.current.step).toBe('planning');
    expect(result.current.plan).toHaveLength(1);
    expect(result.current.plan![0]).toEqual({
      itemId: 'habit-1',
      title: 'Morning Meditation',
      steps: ['Find a quiet spot', 'Set a timer for 5 minutes', 'Start breathing'],
      encouragement: 'Small steps lead to big changes!',
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('handles AI failure with fallback plan', async () => {
    (CortexClient.callChat as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'Network error',
    });

    const { result } = renderHook(() => useOverwhelmFlow());

    await act(async () => {
      await result.current.requestPlan([
        { id: 'todo-1', title: 'Complete project' },
        { id: 'habit-1', title: 'Exercise' },
      ]);
    });

    expect(result.current.step).toBe('planning');
    expect(result.current.plan).toHaveLength(2);
    expect(result.current.plan![0]).toEqual({
      itemId: 'todo-1',
      title: 'Complete project',
      steps: ['Start with the first small step', 'Build momentum', 'Keep going'],
      encouragement: "You've got this!",
    });
  });

  it('handles malformed AI response with fallback', async () => {
    (CortexClient.callChat as jest.Mock).mockResolvedValue({
      ok: true,
      data: 'This is not valid JSON',
    });

    const { result } = renderHook(() => useOverwhelmFlow());

    await act(async () => {
      await result.current.requestPlan([{ id: 'habit-1', title: 'Morning Routine' }]);
    });

    expect(result.current.step).toBe('planning');
    expect(result.current.plan).toHaveLength(1);
    expect(result.current.plan![0].steps).toEqual([
      'Start with the first small step',
      'Build momentum',
      'Keep going',
    ]);
  });

  it('enters focus mode', () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    act(() => {
      result.current.enterFocusMode();
    });

    expect(result.current.step).toBe('focus');
  });

  it('exits focus mode to planning when plan exists', async () => {
    (CortexClient.callChat as jest.Mock).mockResolvedValue({
      ok: true,
      data: JSON.stringify([
        {
          itemId: 'habit-1',
          title: 'Test',
          steps: ['Step 1'],
          encouragement: 'Go!',
        },
      ]),
    });

    const { result } = renderHook(() => useOverwhelmFlow());

    await act(async () => {
      await result.current.requestPlan([{ id: 'habit-1', title: 'Test' }]);
    });

    act(() => {
      result.current.enterFocusMode();
    });
    expect(result.current.step).toBe('focus');

    act(() => {
      result.current.exitFocusMode();
    });
    expect(result.current.step).toBe('planning');
  });

  it('exits focus mode to idle when no plan exists', () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    act(() => {
      result.current.enterFocusMode();
      result.current.exitFocusMode();
    });

    expect(result.current.step).toBe('idle');
  });

  it('does nothing when requestPlan called with empty items', async () => {
    const { result } = renderHook(() => useOverwhelmFlow());

    await act(async () => {
      await result.current.requestPlan([]);
    });

    expect(result.current.plan).toBeNull();
    expect(result.current.step).toBe('idle');
    expect(CortexClient.callChat).not.toHaveBeenCalled();
  });
});
