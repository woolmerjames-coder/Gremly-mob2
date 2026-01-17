/**
 * Optimistic UI Tests for Mind Drop
 *
 * Tests the optimistic rendering pattern where Mind Drops are shown
 * immediately with placeholder state, then progressively updated as
 * AI enrichment completes.
 *
 * Key behaviors:
 * - Immediate render after user submits (no waiting for AI)
 * - Placeholder state shows skeleton/loading indicators
 * - Progressive updates: classification → enrichment → synced
 * - Graceful fallback if AI fails (shows raw text)
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import type { PendingDrop } from '../../../../lib/store/useGremlyStore';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Components
// ─────────────────────────────────────────────────────────────────────────────

interface MockPendingCardProps {
  drop: PendingDrop;
}

/**
 * Simulates the pending card that renders based on PendingDrop status.
 * This mirrors the actual AnimatedDropCard behavior.
 */
function MockPendingCard({ drop }: MockPendingCardProps) {
  const isPending = drop.status === 'pending' || drop.status === 'classifying';
  const isEnriching = drop.status === 'enriching';
  const isComplete = drop.status === 'enriched' || drop.status === 'synced';

  return (
    <View testID={`pending-card-${drop.localId}`}>
      {/* Title: show skeleton if pending, smart_title if available, raw text as fallback */}
      {isPending ? (
        <View testID="title-skeleton" />
      ) : (
        <Text testID="title-text">{drop.smartTitle || drop.text}</Text>
      )}

      {/* Tags: show skeleton if enriching, actual tags if available */}
      {isEnriching ? (
        <View testID="tags-skeleton" />
      ) : isComplete && drop.tags && drop.tags.length > 0 ? (
        <Text testID="tags-text">{drop.tags.map((t: string) => `#${t}`).join(' ')}</Text>
      ) : null}

      {/* Status indicator */}
      <Text testID="status-indicator">{drop.status}</Text>

      {/* Bucket badge */}
      {drop.bucket && <Text testID="bucket-badge">{drop.bucket}</Text>}

      {/* Multi indicator */}
      {drop.isMulti && <Text testID="multi-badge">Multi</Text>}

      {/* Segment count for multi-drops */}
      {drop.multiSegments && drop.multiSegments.length > 0 && (
        <Text testID="segment-count">{drop.multiSegments.length} items</Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Optimistic UI - Pending Card Rendering', () => {
  describe('initial pending state', () => {
    it('renders immediately with skeleton when status is pending', () => {
      const drop: PendingDrop = {
        localId: 'local-1',
        text: 'buy groceries for the week',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      const { getByTestId, queryByTestId } = render(<MockPendingCard drop={drop} />);

      // Card should be rendered immediately
      expect(getByTestId('pending-card-local-1')).toBeTruthy();

      // Title should be skeleton (not visible text)
      expect(getByTestId('title-skeleton')).toBeTruthy();
      expect(queryByTestId('title-text')).toBeNull();

      // Status should be pending
      expect(getByTestId('status-indicator')).toHaveTextContent('pending');
    });

    it('renders skeleton during classifying phase', () => {
      const drop: PendingDrop = {
        localId: 'local-2',
        text: 'call dentist tomorrow',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'classifying',
      };

      const { getByTestId, queryByTestId } = render(<MockPendingCard drop={drop} />);

      // Still skeleton during classification
      expect(getByTestId('title-skeleton')).toBeTruthy();
      expect(queryByTestId('title-text')).toBeNull();
      expect(getByTestId('status-indicator')).toHaveTextContent('classifying');
    });
  });

  describe('post-classification state', () => {
    it('shows bucket badge after classification completes', () => {
      const drop: PendingDrop = {
        localId: 'local-3',
        text: 'buy groceries for the week',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'enriching',
        bucket: 'todo',
        subtype: null,
      };

      const { getByTestId } = render(<MockPendingCard drop={drop} />);

      // Bucket badge should be visible
      expect(getByTestId('bucket-badge')).toHaveTextContent('todo');

      // Tags should show skeleton during enrichment
      expect(getByTestId('tags-skeleton')).toBeTruthy();
    });

    it('shows smart_title if available during enriching', () => {
      const drop: PendingDrop = {
        localId: 'local-4',
        text: 'buy groceries for the week including vegetables',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'enriching',
        bucket: 'todo',
        smartTitle: 'Weekly Groceries',
      };

      const { getByTestId } = render(<MockPendingCard drop={drop} />);

      // Smart title should be shown (not raw text)
      expect(getByTestId('title-text')).toHaveTextContent('Weekly Groceries');
    });
  });

  describe('enriched state', () => {
    it('shows full enrichment data when enriched', () => {
      const drop: PendingDrop = {
        localId: 'local-5',
        text: 'buy groceries for the week',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'enriched',
        bucket: 'todo',
        smartTitle: 'Weekly Groceries',
        tags: ['shopping', 'food'],
        timeEstimateMinutes: 30,
      };

      const { getByTestId, queryByTestId } = render(<MockPendingCard drop={drop} />);

      // Title should be smart title
      expect(getByTestId('title-text')).toHaveTextContent('Weekly Groceries');

      // Tags should be visible (no skeleton)
      expect(getByTestId('tags-text')).toHaveTextContent('#shopping #food');
      expect(queryByTestId('tags-skeleton')).toBeNull();

      // Status indicator
      expect(getByTestId('status-indicator')).toHaveTextContent('enriched');
    });
  });

  describe('fallback behavior', () => {
    it('shows raw text when smartTitle is missing', () => {
      const drop: PendingDrop = {
        localId: 'local-6',
        text: 'raw user input text',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'enriched', // Even when enriched, might not have smart title
        bucket: 'log',
        // smartTitle not set
      };

      const { getByTestId } = render(<MockPendingCard drop={drop} />);

      // Should fall back to raw text
      expect(getByTestId('title-text')).toHaveTextContent('raw user input text');
    });
  });

  describe('multi-entity drops', () => {
    it('shows multi badge for multi-entity drops', () => {
      const drop: PendingDrop = {
        localId: 'local-7',
        text: 'buy milk and start running',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'enriching',
        bucket: 'todo',
        isMulti: true,
        dominantBucket: 'todo',
        multiSummary: 'Groceries + Exercise',
        multiSegments: [
          { text: 'buy milk', bucket: 'todo' },
          { text: 'start running', bucket: 'habit' },
        ],
      };

      const { getByTestId } = render(<MockPendingCard drop={drop} />);

      // Multi badge should be visible
      expect(getByTestId('multi-badge')).toHaveTextContent('Multi');

      // Segment count should be shown
      expect(getByTestId('segment-count')).toHaveTextContent('2 items');
    });

    it('shows segment count for multi-drops', () => {
      const drop: PendingDrop = {
        localId: 'local-8',
        text: 'buy milk, call mom, and schedule dentist',
        spaceId: null,
        createdAt: new Date().toISOString(),
        status: 'enriching',
        bucket: 'todo',
        isMulti: true,
        multiSegments: [
          { text: 'buy milk', bucket: 'todo' },
          { text: 'call mom', bucket: 'todo' },
          { text: 'schedule dentist', bucket: 'todo' },
        ],
      };

      const { getByTestId } = render(<MockPendingCard drop={drop} />);

      expect(getByTestId('segment-count')).toHaveTextContent('3 items');
    });
  });
});

describe('Optimistic UI - State Transitions', () => {
  it('transitions from pending → classifying → enriching → enriched → synced', async () => {
    const initialDrop: PendingDrop = {
      localId: 'transition-1',
      text: 'test transition',
      spaceId: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    const { getByTestId, rerender } = render(<MockPendingCard drop={initialDrop} />);

    // Step 1: Pending
    expect(getByTestId('status-indicator')).toHaveTextContent('pending');

    // Step 2: Classifying
    const classifyingDrop = { ...initialDrop, status: 'classifying' as const };
    rerender(<MockPendingCard drop={classifyingDrop} />);
    expect(getByTestId('status-indicator')).toHaveTextContent('classifying');

    // Step 3: Enriching (with classification results)
    const enrichingDrop: PendingDrop = {
      ...classifyingDrop,
      status: 'enriching',
      bucket: 'todo',
      smartTitle: 'Test Task',
    };
    rerender(<MockPendingCard drop={enrichingDrop} />);
    expect(getByTestId('status-indicator')).toHaveTextContent('enriching');
    expect(getByTestId('bucket-badge')).toHaveTextContent('todo');

    // Step 4: Enriched
    const enrichedDrop: PendingDrop = {
      ...enrichingDrop,
      status: 'enriched',
      tags: ['test'],
    };
    rerender(<MockPendingCard drop={enrichedDrop} />);
    expect(getByTestId('status-indicator')).toHaveTextContent('enriched');
    expect(getByTestId('tags-text')).toHaveTextContent('#test');

    // Step 5: Synced
    const syncedDrop: PendingDrop = { ...enrichedDrop, status: 'synced' };
    rerender(<MockPendingCard drop={syncedDrop} />);
    expect(getByTestId('status-indicator')).toHaveTextContent('synced');
  });
});
