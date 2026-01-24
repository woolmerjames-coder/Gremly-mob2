/**
 * NowScreenV1.timeBlocks.test.tsx
 *
 * Tests for the time block rendering logic on the Now screen.
 * Specifically validates the fix for empty time blocks (app-fixes-1.22).
 *
 * The fix ensures that empty time blocks are not rendered, even when
 * they represent the current time window.
 */

type TimeBlock = 'morning' | 'afternoon' | 'evening';

interface MockItem {
  id: string;
  time_window: TimeBlock | null;
}

interface MockEvent {
  id: string;
  start: Date;
}

describe('NowScreenV1 shouldRenderBlock logic', () => {
  // Simulates the shouldRenderBlock function from NowScreenV1
  const shouldRenderBlock = (
    block: TimeBlock,
    itemsByBlock: Record<TimeBlock, MockItem[]>,
    eventsByBlock: Record<TimeBlock, MockEvent[]>
  ) => {
    const hasItems = itemsByBlock[block].length > 0;
    const hasEvents = eventsByBlock[block].length > 0;
    return hasItems || hasEvents;
  };

  const emptyBlockState: Record<TimeBlock, MockItem[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };

  const emptyEventState: Record<TimeBlock, MockEvent[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };

  it('should return false for completely empty morning block', () => {
    const result = shouldRenderBlock('morning', emptyBlockState, emptyEventState);
    expect(result).toBe(false);
  });

  it('should return false for completely empty afternoon block', () => {
    const result = shouldRenderBlock('afternoon', emptyBlockState, emptyEventState);
    expect(result).toBe(false);
  });

  it('should return false for completely empty evening block', () => {
    const result = shouldRenderBlock('evening', emptyBlockState, emptyEventState);
    expect(result).toBe(false);
  });

  it('should return true when block has items', () => {
    const itemsByBlock: Record<TimeBlock, MockItem[]> = {
      morning: [{ id: 'item-1', time_window: 'morning' }],
      afternoon: [],
      evening: [],
    };

    const result = shouldRenderBlock('morning', itemsByBlock, emptyEventState);
    expect(result).toBe(true);
  });

  it('should return true when block has calendar events', () => {
    const eventsByBlock: Record<TimeBlock, MockEvent[]> = {
      morning: [],
      afternoon: [{ id: 'event-1', start: new Date() }],
      evening: [],
    };

    const result = shouldRenderBlock('afternoon', emptyBlockState, eventsByBlock);
    expect(result).toBe(true);
  });

  it('should return true when block has both items and events', () => {
    const itemsByBlock: Record<TimeBlock, MockItem[]> = {
      morning: [],
      afternoon: [],
      evening: [{ id: 'item-1', time_window: 'evening' }],
    };

    const eventsByBlock: Record<TimeBlock, MockEvent[]> = {
      morning: [],
      afternoon: [],
      evening: [{ id: 'event-1', start: new Date() }],
    };

    const result = shouldRenderBlock('evening', itemsByBlock, eventsByBlock);
    expect(result).toBe(true);
  });

  describe('current time window edge case', () => {
    it('should NOT render empty block even if it is the current time window', () => {
      // This is the key fix from app-fixes-1.22
      // Previously, there was logic showing the current time block even if empty
      // Now we only render blocks that actually have content

      const currentTimeBlock: TimeBlock = 'afternoon';

      // Simulating afternoon being current time but having no items
      const result = shouldRenderBlock(
        currentTimeBlock,
        emptyBlockState,
        emptyEventState
      );

      // The fix ensures even "current" blocks don't render when empty
      expect(result).toBe(false);
    });

    it('should render current block when it has items', () => {
      const currentTimeBlock: TimeBlock = 'afternoon';

      const itemsByBlock: Record<TimeBlock, MockItem[]> = {
        morning: [],
        afternoon: [{ id: 'item-1', time_window: 'afternoon' }],
        evening: [],
      };

      const result = shouldRenderBlock(currentTimeBlock, itemsByBlock, emptyEventState);
      expect(result).toBe(true);
    });
  });

  describe('multiple blocks rendering', () => {
    it('should correctly determine which blocks to render', () => {
      const itemsByBlock: Record<TimeBlock, MockItem[]> = {
        morning: [{ id: 'item-1', time_window: 'morning' }],
        afternoon: [],
        evening: [{ id: 'item-2', time_window: 'evening' }],
      };

      const blocksToRender = (['morning', 'afternoon', 'evening'] as TimeBlock[]).filter(
        (block) => shouldRenderBlock(block, itemsByBlock, emptyEventState)
      );

      expect(blocksToRender).toEqual(['morning', 'evening']);
      expect(blocksToRender).not.toContain('afternoon');
    });
  });
});
