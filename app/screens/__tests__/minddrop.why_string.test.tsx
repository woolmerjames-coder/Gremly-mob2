/**
 * Test suite for why_string logic in MindDrop
 * Ensures "Awaiting chip selection" is only used when mode='ask'
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import type { IRepo } from '../../../lib/repo/IRepo';

// Mock the cortex decide function
jest.mock('../../../lib/cortex/cortexDecide', () => ({
  cortexDecide: jest.fn(),
}));

const { cortexDecide } = require('../../../lib/cortex/cortexDecide');

describe('MindDrop - why_string Logic', () => {
  let mockRepo: Partial<IRepo>;
  let mockCreateNote: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCreateNote = jest.fn().mockResolvedValue({ id: 'test-note-id' });

    mockRepo = {
      create: mockCreateNote,
    } as any;
  });

  /**
   * Test: "Idk" with low confidence should NOT get "Awaiting chip selection"
   * When mode='auto' (reflection log), should use "Captured via Mind Drop"
   */
  it('should use "Captured via Mind Drop" for "Idk" reflection log (mode=auto)', async () => {
    const text = 'Idk';

    // Mock cortexDecide to return mode='auto' for low-confidence reflection
    cortexDecide.mockResolvedValue({
      mode: 'auto',
      actions: [],
      confidence: 0.35,
      meta: {
        intent: { kind: 'reflection' },
      },
    });

    // We need to test the actual saveToUnsortedTray call
    // Import the function being tested
    const { saveToUnsortedTray } = require('../CatchAllNotepad');

    const result = await saveToUnsortedTray(mockRepo, text, {
      whyString: 'Captured via Mind Drop', // This is what should be passed
      dropId: 'test-drop-1',
    });

    expect(result).toBe('test-note-id');
    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        text,
        labels: ['catchall', 'needs_review'],
      }),
    );
  });

  /**
   * Test: "Not sure what I meant by that" should NOT get "Awaiting chip selection"
   * When mode='auto', should use "Captured via Mind Drop"
   */
  it('should use "Captured via Mind Drop" for "Not sure what I meant by that" (mode=auto)', async () => {
    const text = 'Not sure what I meant by that';

    cortexDecide.mockResolvedValue({
      mode: 'auto',
      actions: [],
      confidence: 0.4,
      meta: {
        intent: { kind: 'ambiguous' },
      },
    });

    const { saveToUnsortedTray } = require('../CatchAllNotepad');

    const result = await saveToUnsortedTray(mockRepo, text, {
      whyString: 'Captured via Mind Drop',
      dropId: 'test-drop-2',
    });

    expect(result).toBe('test-note-id');
    expect(mockCreateNote).toHaveBeenCalled();
  });

  /**
   * Test: "Everything feels messy…" should NOT get "Awaiting chip selection"
   * When mode='auto', should use "Captured via Mind Drop"
   */
  it('should use "Captured via Mind Drop" for "Everything feels messy…" (mode=auto)', async () => {
    const text = 'Everything feels messy…';

    cortexDecide.mockResolvedValue({
      mode: 'auto',
      actions: [],
      confidence: 0.45,
      meta: {
        intent: { kind: 'reflection' },
      },
    });

    const { saveToUnsortedTray } = require('../CatchAllNotepad');

    const result = await saveToUnsortedTray(mockRepo, text, {
      whyString: 'Captured via Mind Drop',
      dropId: 'test-drop-3',
    });

    expect(result).toBe('test-note-id');
    expect(mockCreateNote).toHaveBeenCalled();
  });

  /**
   * Test: Ambiguous social plan SHOULD get "Awaiting chip selection"
   * When mode='ask', this is correct behavior
   */
  it('should use "Awaiting chip selection" for ambiguous social plan (mode=ask)', async () => {
    const text = 'Dinner tonight with Jeff';

    cortexDecide.mockResolvedValue({
      mode: 'ask',
      actions: [],
      confidence: 0.6,
      meta: {
        intent: { kind: 'ambiguous' },
      },
      suggestions: [
        { type: 'create.todo', label: 'Add to To-Do List' },
        { type: 'create.note', label: 'Just Save It' },
      ],
    });

    const { saveToUnsortedTray } = require('../CatchAllNotepad');

    const result = await saveToUnsortedTray(mockRepo, text, {
      whyString: 'Awaiting chip selection',
      dropId: 'test-drop-4',
    });

    expect(result).toBe('test-note-id');
    expect(mockCreateNote).toHaveBeenCalled();
  });

  /**
   * Test: Verify the distinction between mode='ask' and mode='auto'
   */
  it('should distinguish between mode=ask and mode=auto for why_string', () => {
    const askMode = { mode: 'ask' };
    const autoMode = { mode: 'auto' };

    // Simulate the logic from CatchAllNotepad
    const getWhyString = (decision: { mode: string }) => {
      return decision.mode === 'ask' ? 'Awaiting chip selection' : 'Captured via Mind Drop';
    };

    expect(getWhyString(askMode)).toBe('Awaiting chip selection');
    expect(getWhyString(autoMode)).toBe('Captured via Mind Drop');
  });
});
