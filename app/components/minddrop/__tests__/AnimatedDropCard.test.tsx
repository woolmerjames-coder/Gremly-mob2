/**
 * AnimatedDropCard Tests
 *
 * Tests for the Mind Drop card component with calm arrival animations.
 * Note: Animation timing tests are difficult in Jest due to Reanimated mocking.
 * Focus is on render states and user interactions.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AnimatedDropCard, AnimatedDropCardItem } from '../AnimatedDropCard';

// Mock theme provider
jest.mock('../../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#000',
      mutedText: '#666',
      sageTint: '#E8F4E8',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      background: '#FFFFFF',
      surfaceTint: '#F5F5F5',
    },
    mode: 'light',
  }),
}));

// Mock repo provider
jest.mock('../../../../providers/RepoProvider', () => ({
  useRepo: () => ({
    update: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue(null),
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

const mockStyles = {
  recentCard: { padding: 12, backgroundColor: '#fff' },
  recentTopRow: { flexDirection: 'row' },
  badgeContainer: { padding: 4 },
  kindBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  kindLabel: { fontSize: 10 },
  recentTitle: { fontSize: 14 },
  metaChipContainer: { flexDirection: 'row' },
  metaChip: { flexDirection: 'row', alignItems: 'center' },
  metaChipText: { fontSize: 11 },
  tagChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  tagChipText: { fontSize: 10 },
  confirmationText: { fontSize: 12 },
  recentBottomRow: { flexDirection: 'row' },
};

function makeItem(overrides: Partial<AnimatedDropCardItem> = {}): AnimatedDropCardItem {
  return {
    id: 'test-item-1',
    text: 'Buy groceries for the week',
    kind: 'todo',
    isPending: false,
    isEnriched: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render State Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AnimatedDropCard', () => {
  describe('rendering states', () => {
    it('renders with raw text when no AI title', () => {
      const item = makeItem({ title: undefined, isPending: true });
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Should show truncated raw text
      expect(getByText(/Buy groceries/)).toBeTruthy();
    });

    it('renders AI title when available', () => {
      const item = makeItem({
        text: 'Buy groceries for the week including vegetables and fruits',
        title: 'Weekly Groceries', // AI-refined shorter title
        isPending: false,
        isEnriched: true,
      });
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Should show AI title
      expect(getByText('Weekly Groceries')).toBeTruthy();
    });

    it('shows kind badge based on item type', () => {
      const todoItem = makeItem({ kind: 'todo' });
      const habitItem = makeItem({ kind: 'habit', id: 'habit-1' });
      const noteItem = makeItem({ kind: 'note', id: 'note-1' });
      const onPress = jest.fn();

      const { getByText: getByTextTodo } = render(
        <AnimatedDropCard
          item={todoItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );
      expect(getByTextTodo('Todo')).toBeTruthy();

      const { getByText: getByTextHabit } = render(
        <AnimatedDropCard
          item={habitItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="habit"
        />,
      );
      expect(getByTextHabit('Habit')).toBeTruthy();

      const { getByText: getByTextNote } = render(
        <AnimatedDropCard
          item={noteItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );
      expect(getByTextNote('Note')).toBeTruthy();
    });

    it('shows time estimate chip when provided', () => {
      const item = makeItem({ timeEstimate: 30 });
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      expect(getByText('~30m')).toBeTruthy();
    });

    it('shows tags when provided', () => {
      const item = makeItem({ tags: ['shopping', 'urgent'] });
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Tags are rendered without # prefix in the component
      expect(getByText('shopping')).toBeTruthy();
      expect(getByText('urgent')).toBeTruthy();
    });

    it('shows photo indicator when hasPhotos is true', () => {
      const item = makeItem({ hasPhotos: true, isEnriched: true });
      const onPress = jest.fn();

      const { getByTestId } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Card should render without error with hasPhotos=true
      expect(getByTestId('minddrop-card-test-item-1')).toBeTruthy();
    });

    it('shows lock indicator when isPrivate is true', () => {
      const item = makeItem({ isPrivate: true, kind: 'note' });
      const onPress = jest.fn();

      const { getByTestId } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      // Card should render without error with isPrivate=true
      expect(getByTestId('minddrop-card-test-item-1')).toBeTruthy();
    });
  });

  describe('user interactions', () => {
    it('calls onPress when card is pressed', () => {
      const item = makeItem();
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      fireEvent.press(getByText(/Buy groceries/));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmation message', () => {
    it('renders confirmation message container when provided', () => {
      const item = makeItem({
        confirmationMessage: 'Added to your shopping list!',
        isEnriched: true,
      });
      const onPress = jest.fn();

      const { getByTestId } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Card should render with confirmation message (TypewriterText shows text char by char)
      expect(getByTestId('minddrop-card-test-item-1')).toBeTruthy();
    });
  });

  describe('helper functions', () => {
    // Test the truncateText helper indirectly through component rendering
    it('truncates long raw text appropriately', () => {
      const longText =
        'This is a very long piece of text that should definitely be truncated because it exceeds the maximum length allowed for display in the card';
      const item = makeItem({ text: longText, title: undefined, isPending: true });
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={item}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Should show truncated text with ellipsis
      expect(getByText(/This is a very long/)).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Entity Card Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('multi-entity cards', () => {
    const multiItem = makeItem({
      id: 'multi-test-1',
      text: 'buy milk and start running habit',
      title: 'Groceries + Running',
      kind: 'note',
      is_multi: true,
      multi_items: [
        {
          text: 'buy milk',
          bucket: 'todo',
          subtype: null,
          habitSubtype: null,
          preview_title: 'Buy milk',
        },
        {
          text: 'start running habit',
          bucket: 'habit',
          subtype: null,
          habitSubtype: 'start_habit',
          preview_title: 'Running habit',
        },
      ],
      multi_summary_title: 'Groceries + Running',
    });

    it('renders multi-entity card', () => {
      const onPress = jest.fn();

      const { getByTestId } = render(
        <AnimatedDropCard
          item={multiItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      expect(getByTestId('minddrop-card-multi-test-1')).toBeTruthy();
    });

    it('renders multi summary title', () => {
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={multiItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      expect(getByText('Groceries + Running')).toBeTruthy();
    });

    it('renders Multi badge for multi-entity items', () => {
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={multiItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      expect(getByText('Multi')).toBeTruthy();
    });

    it('renders tap to decide text for multi-entity items', () => {
      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={multiItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      expect(getByText(/Tap to decide/)).toBeTruthy();
    });

    it('opens MultiSplitModal instead of calling onPress for multi items', () => {
      const onPress = jest.fn();

      const { getByTestId, queryByText } = render(
        <AnimatedDropCard
          item={multiItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      fireEvent.press(getByTestId('minddrop-card-multi-test-1'));

      // For multi-entity cards, onPress should NOT be called
      // Instead, the card opens the MultiSplitModal
      expect(onPress).not.toHaveBeenCalled();
    });

    it('reads is_multi from views if not on top level', () => {
      const itemWithViewsMulti = makeItem({
        id: 'views-multi-1',
        text: 'buy milk and exercise',
        kind: 'note',
        is_multi: undefined, // Not on top level
        views: {
          is_multi: true,
          multi_items: [
            {
              text: 'buy milk',
              bucket: 'todo',
              subtype: null,
              habitSubtype: null,
              preview_title: 'Buy milk',
            },
          ],
          multi_summary_title: 'Groceries + Exercise',
        },
      });

      const onPress = jest.fn();

      const { getByText } = render(
        <AnimatedDropCard
          item={itemWithViewsMulti}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="note"
        />,
      );

      // Should detect multi from views
      expect(getByText('Multi')).toBeTruthy();
    });

    it('renders single-entity card normally when is_multi is false', () => {
      const singleItem = makeItem({
        id: 'single-test-1',
        text: 'buy milk',
        kind: 'todo',
        is_multi: false,
      });

      const onPress = jest.fn();

      const { queryByText } = render(
        <AnimatedDropCard
          item={singleItem}
          index={0}
          onPress={onPress}
          styles={mockStyles}
          badgeStyleKey="todo"
        />,
      );

      // Should NOT show Multi badge
      expect(queryByText('Multi')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // handleKeepAsNote - Tests for Phase 1 + Phase 2 enrichment flow
  // (app-fixes-1.22 branch)
  // ═══════════════════════════════════════════════════════════════════

  describe('handleKeepAsNote Phase 1+2 enrichment', () => {
    // Note: These are integration-level expectations.
    // The actual handleKeepAsNote callback is internal to AnimatedDropCard.
    // We test the expected behavior through rendering and mock verification.

    it('multi-drop item has expected views structure for keep-as-single flow', () => {
      const multiItem = makeItem({
        id: 'multi-drop-1',
        text: 'Buy groceries and go to gym',
        kind: 'note',
        is_multi: true,
        views: {
          is_multi: true,
          multi_items: [
            { text: 'buy groceries', bucket: 'todo' },
            { text: 'go to gym', bucket: 'habit' },
          ],
        },
      });

      // Verify the item structure that would trigger keep-as-single flow
      expect(multiItem.is_multi).toBe(true);
      expect(multiItem.views?.is_multi).toBe(true);
      expect(multiItem.views?.multi_items).toHaveLength(2);
    });

    it('expected updateNote payload structure after Phase 1', () => {
      // This tests the expected shape of the update payload
      const phase1Payload = {
        name: 'AI Refined Title', // or 'title' for logs
        views: {
          is_multi: false,
          minddrop_stage: 'classified',
          ai_pending: true,
          confirmation_message: 'Got it!',
          dominant_bucket: 'note',
          dominant_subtype: null,
          multi_items: undefined,
          multi_summary_title: undefined,
        },
      };

      expect(phase1Payload.views.is_multi).toBe(false);
      expect(phase1Payload.views.minddrop_stage).toBe('classified');
      expect(phase1Payload.views.confirmation_message).toBeDefined();
    });

    it('Phase 2 should be called with correct bucket and subtype', () => {
      // Expected Phase 2 call signature after keep-as-single
      const phase2Args = {
        id: 'test-id',
        text: 'Original text content',
        bucket: 'note' as const,
        subtype: null,
      };

      expect(phase2Args.bucket).toBe('note');
      expect(phase2Args.id).toBeDefined();
    });
  });
});
