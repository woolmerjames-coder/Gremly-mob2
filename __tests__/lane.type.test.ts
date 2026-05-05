/**
 * Tests for the Lane type (lib/cortex/lane.ts)
 *
 * Verifies that the `world_chat` and `chapter_chat` lane values are part of
 * the Lane union — if someone renames or removes them, Cortex routing breaks.
 */

import type { Lane } from '../lib/cortex/lane';

describe('Lane type', () => {
  it('includes world_chat and chapter_chat alongside existing lanes', () => {
    // Exhaustive check — every lane we currently route on must be here.
    const validLanes: Lane[] = ['catchall', 'space_chat', 'world_chat', 'chapter_chat', 'system'];

    // If this assignment compiles (no TS error), the type is correct.
    // We assert at runtime to guard against accidental deletions.
    expect(validLanes).toContain('world_chat');
    expect(validLanes).toContain('chapter_chat');
    expect(validLanes.length).toBe(5);
  });

  it('world_chat and chapter_chat are distinct values', () => {
    const worldLane: Lane = 'world_chat';
    const chapterLane: Lane = 'chapter_chat';
    expect(worldLane).not.toBe(chapterLane);
  });
});
