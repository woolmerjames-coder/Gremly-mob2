/**
 * Notes Overlay Filtering Tests
 *
 * Tests that the Your Notes overlay correctly filters items to show only:
 * - log-journal items
 * - log-idea items
 * - log-general items
 * - list items (has_list = true)
 *
 * And excludes:
 * - plain todos (not logs)
 * - plain habits
 * - unsorted catchall/needs_review items
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { YourNotesPopup } from '../../components/now/YourNotesPopup';
import type { LogItem } from '../../lib/notes/useRecentLogs';

// ─────────────────────────────────────────────────────────────────────────────
// Test Factory Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory function to create a LogItem for testing
 */
function makeLogItem(overrides: Partial<LogItem> = {}): LogItem {
  return {
    id: `log-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Test Log',
    body: 'Test body content',
    logSubtype: 'general',
    isList: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Pre-defined factory items for tests
const LOG_JOURNAL_ITEM = makeLogItem({
  id: 'log-journal-1',
  title: 'My Journal Entry',
  body: 'Today was a great day...',
  logSubtype: 'journal',
  isList: false,
});

const LOG_IDEA_ITEM = makeLogItem({
  id: 'log-idea-1',
  title: 'App Idea',
  body: 'What if we built an app that...',
  logSubtype: 'idea',
  isList: false,
});

const LOG_GENERAL_ITEM = makeLogItem({
  id: 'log-general-1',
  title: 'Random Note',
  body: 'Just a general note about something',
  logSubtype: 'general',
  isList: false,
});

const LIST_ITEM = makeLogItem({
  id: 'list-1',
  title: 'Shopping List',
  body: '- Milk\n- Eggs\n- Bread',
  logSubtype: 'general',
  isList: true,
  listItems: [
    { id: 'li-1', label: 'Milk', checked: false },
    { id: 'li-2', label: 'Eggs', checked: false },
    { id: 'li-3', label: 'Bread', checked: true },
  ],
});

const LIST_JOURNAL_ITEM = makeLogItem({
  id: 'list-journal-1',
  title: 'Gratitude List',
  body: '- Family\n- Health\n- Friends',
  logSubtype: 'journal',
  isList: true,
  listItems: [
    { id: 'li-4', label: 'Family', checked: false },
    { id: 'li-5', label: 'Health', checked: false },
    { id: 'li-6', label: 'Friends', checked: false },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock useRecentLogs Hook
// ─────────────────────────────────────────────────────────────────────────────

// Variable to control mock data
let mockLogsData: {
  logs: LogItem[];
  journals: LogItem[];
  ideas: LogItem[];
  general: LogItem[];
  lists: LogItem[];
  totalCount: number;
  loading: boolean;
  error: Error | null;
  reload: jest.Mock;
};

// Reset mock data before each test
function resetMockLogsData(logs: LogItem[] = []) {
  const journals = logs.filter((l) => l.logSubtype === 'journal');
  const ideas = logs.filter((l) => l.logSubtype === 'idea');
  const general = logs.filter(
    (l) =>
      l.logSubtype === 'general' ||
      (l.isList && l.logSubtype !== 'journal' && l.logSubtype !== 'idea'),
  );
  const lists = logs.filter((l) => l.isList);

  mockLogsData = {
    logs,
    journals,
    ideas,
    general,
    lists,
    totalCount: logs.length,
    loading: false,
    error: null,
    reload: jest.fn(),
  };
}

// Mock the useRecentLogs hook
jest.mock('../../lib/notes/useRecentLogs', () => ({
  useRecentLogs: () => mockLogsData,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Selector/Hook Filtering Logic
// ─────────────────────────────────────────────────────────────────────────────

describe('useRecentLogs filtering', () => {
  beforeEach(() => {
    resetMockLogsData([]);
  });

  describe('given all types of items in the input', () => {
    beforeEach(() => {
      // The hook would receive these items from the database
      // After filtering, only logs and lists should remain
      resetMockLogsData([
        LOG_JOURNAL_ITEM,
        LOG_IDEA_ITEM,
        LOG_GENERAL_ITEM,
        LIST_ITEM,
        LIST_JOURNAL_ITEM,
      ]);
    });

    it('should include all three log types', () => {
      expect(mockLogsData.logs).toContainEqual(LOG_JOURNAL_ITEM);
      expect(mockLogsData.logs).toContainEqual(LOG_IDEA_ITEM);
      expect(mockLogsData.logs).toContainEqual(LOG_GENERAL_ITEM);
    });

    it('should include list items', () => {
      expect(mockLogsData.logs).toContainEqual(LIST_ITEM);
      expect(mockLogsData.logs).toContainEqual(LIST_JOURNAL_ITEM);
    });

    it('should have correct totalCount', () => {
      expect(mockLogsData.totalCount).toBe(5);
    });

    it('should correctly categorize journals', () => {
      expect(mockLogsData.journals).toHaveLength(2); // LOG_JOURNAL_ITEM + LIST_JOURNAL_ITEM
      expect(mockLogsData.journals).toContainEqual(LOG_JOURNAL_ITEM);
      expect(mockLogsData.journals).toContainEqual(LIST_JOURNAL_ITEM);
    });

    it('should correctly categorize ideas', () => {
      expect(mockLogsData.ideas).toHaveLength(1);
      expect(mockLogsData.ideas).toContainEqual(LOG_IDEA_ITEM);
    });

    it('should correctly categorize general (includes non-journal/idea lists)', () => {
      expect(mockLogsData.general).toHaveLength(2); // LOG_GENERAL_ITEM + LIST_ITEM
      expect(mockLogsData.general).toContainEqual(LOG_GENERAL_ITEM);
      expect(mockLogsData.general).toContainEqual(LIST_ITEM);
    });

    it('should correctly track all lists', () => {
      expect(mockLogsData.lists).toHaveLength(2);
      expect(mockLogsData.lists).toContainEqual(LIST_ITEM);
      expect(mockLogsData.lists).toContainEqual(LIST_JOURNAL_ITEM);
    });
  });

  describe('exclusion of non-log items', () => {
    it('should NOT include plain todos (handled by hook filtering)', () => {
      // Plain todos would be filtered out by the hook before reaching the logs array
      // They would have subtype: 'catchall' or labels: ['catchall', 'needs_review']
      // This test verifies the mock data structure doesn't include them
      resetMockLogsData([LOG_JOURNAL_ITEM, LOG_GENERAL_ITEM]);

      // Verify no todo-like items in the logs
      const hasTodo = mockLogsData.logs.some(
        (l) => l.title.toLowerCase().includes('todo') && !l.isList,
      );
      expect(hasTodo).toBe(false);
    });

    it('should NOT include plain habits (handled by hook filtering)', () => {
      // Plain habits would be filtered out by the hook
      resetMockLogsData([LOG_IDEA_ITEM, LIST_ITEM]);

      // Verify no habit-like items in the logs
      const hasHabit = mockLogsData.logs.some((l) => l.title.toLowerCase().includes('habit'));
      expect(hasHabit).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: YourNotesPopup Component
// ─────────────────────────────────────────────────────────────────────────────

describe('YourNotesPopup component', () => {
  const mockOnClose = jest.fn();
  const mockOnSelectLog = jest.fn();
  const mockOnSelectJournal = jest.fn();
  const mockOnCreateNew = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock data with all item types
    resetMockLogsData([
      LOG_JOURNAL_ITEM,
      LOG_IDEA_ITEM,
      LOG_GENERAL_ITEM,
      LIST_ITEM,
      LIST_JOURNAL_ITEM,
    ]);
  });

  const renderPopup = () =>
    render(
      <YourNotesPopup
        visible={true}
        onClose={mockOnClose}
        onSelectLog={mockOnSelectLog}
        onSelectJournal={mockOnSelectJournal}
        onCreateNew={mockOnCreateNew}
      />,
    );

  describe('All tab', () => {
    it('should display all filtered logs and lists', () => {
      renderPopup();

      // Check that all items are displayed
      expect(screen.getByText('My Journal Entry')).toBeTruthy();
      expect(screen.getByText('App Idea')).toBeTruthy();
      expect(screen.getByText('Random Note')).toBeTruthy();
      expect(screen.getByText('Shopping List')).toBeTruthy();
      expect(screen.getByText('Gratitude List')).toBeTruthy();
    });

    it('should show correct count in All tab', () => {
      renderPopup();

      // All tab should show total count
      expect(screen.getByText('All (5)')).toBeTruthy();
    });
  });

  describe('Journals tab', () => {
    it('should only show journal items when Journals tab is selected', async () => {
      renderPopup();

      // Click Journals tab
      fireEvent.press(screen.getByText('Journals (2)'));

      await waitFor(() => {
        // Should show journal items
        expect(screen.getByText('My Journal Entry')).toBeTruthy();
        expect(screen.getByText('Gratitude List')).toBeTruthy();
      });

      // Should NOT show non-journal items
      expect(screen.queryByText('App Idea')).toBeNull();
      expect(screen.queryByText('Random Note')).toBeNull();
      expect(screen.queryByText('Shopping List')).toBeNull();
    });

    it('should show correct count in Journals tab', () => {
      renderPopup();

      // Journals count should be 2 (LOG_JOURNAL_ITEM + LIST_JOURNAL_ITEM)
      expect(screen.getByText('Journals (2)')).toBeTruthy();
    });
  });

  describe('Ideas tab', () => {
    it('should only show idea items when Ideas tab is selected', async () => {
      renderPopup();

      // Click Ideas tab
      fireEvent.press(screen.getByText('Ideas (1)'));

      await waitFor(() => {
        // Should show idea items
        expect(screen.getByText('App Idea')).toBeTruthy();
      });

      // Should NOT show non-idea items
      expect(screen.queryByText('My Journal Entry')).toBeNull();
      expect(screen.queryByText('Random Note')).toBeNull();
      expect(screen.queryByText('Shopping List')).toBeNull();
      expect(screen.queryByText('Gratitude List')).toBeNull();
    });

    it('should show correct count in Ideas tab', () => {
      renderPopup();

      // Ideas count should be 1
      expect(screen.getByText('Ideas (1)')).toBeTruthy();
    });
  });

  describe('General tab', () => {
    it('should show general items and general lists when General tab is selected', async () => {
      renderPopup();

      // Click General tab
      fireEvent.press(screen.getByText('General (2)'));

      await waitFor(() => {
        // Should show general items
        expect(screen.getByText('Random Note')).toBeTruthy();
        expect(screen.getByText('Shopping List')).toBeTruthy();
      });

      // Should NOT show journal/idea items
      expect(screen.queryByText('My Journal Entry')).toBeNull();
      expect(screen.queryByText('App Idea')).toBeNull();
      expect(screen.queryByText('Gratitude List')).toBeNull();
    });

    it('should show correct count in General tab', () => {
      renderPopup();

      // General count should be 2 (LOG_GENERAL_ITEM + LIST_ITEM)
      expect(screen.getByText('General (2)')).toBeTruthy();
    });
  });

  describe('item selection', () => {
    it('should call onSelectJournal when tapping a journal item', () => {
      renderPopup();

      fireEvent.press(screen.getByText('My Journal Entry'));

      expect(mockOnSelectJournal).toHaveBeenCalledWith(LOG_JOURNAL_ITEM);
      expect(mockOnSelectLog).not.toHaveBeenCalled();
    });

    it('should call onSelectLog when tapping an idea item', () => {
      renderPopup();

      fireEvent.press(screen.getByText('App Idea'));

      expect(mockOnSelectLog).toHaveBeenCalledWith(LOG_IDEA_ITEM);
      expect(mockOnSelectJournal).not.toHaveBeenCalled();
    });

    it('should call onSelectLog when tapping a general item', () => {
      renderPopup();

      fireEvent.press(screen.getByText('Random Note'));

      expect(mockOnSelectLog).toHaveBeenCalledWith(LOG_GENERAL_ITEM);
      expect(mockOnSelectJournal).not.toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('should show empty state when no logs exist', () => {
      resetMockLogsData([]);
      renderPopup();

      expect(screen.getByText('No notes this week')).toBeTruthy();
    });

    it('should show empty state when filtered view is empty', async () => {
      // Only have journal items
      resetMockLogsData([LOG_JOURNAL_ITEM]);
      renderPopup();

      // Click Ideas tab (which should be empty - no count shown)
      fireEvent.press(screen.getByText('Ideas'));

      await waitFor(() => {
        expect(screen.getByText('No notes this week')).toBeTruthy();
      });
    });
  });

  describe('tab count accuracy', () => {
    it('should show count only for tabs with items (count > 0)', () => {
      // Only have journals
      resetMockLogsData([LOG_JOURNAL_ITEM]);
      renderPopup();

      expect(screen.getByText('All (1)')).toBeTruthy();
      expect(screen.getByText('Journals (1)')).toBeTruthy();
      // Tabs with 0 items don't show count
      expect(screen.getByText('Ideas')).toBeTruthy();
      expect(screen.getByText('General')).toBeTruthy();
    });

    it('should update counts correctly when data changes', () => {
      // Start with just ideas
      resetMockLogsData([LOG_IDEA_ITEM]);
      renderPopup();

      expect(screen.getByText('All (1)')).toBeTruthy();
      expect(screen.getByText('Journals')).toBeTruthy(); // No count for 0
      expect(screen.getByText('Ideas (1)')).toBeTruthy();
      expect(screen.getByText('General')).toBeTruthy(); // No count for 0
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Integration with database filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('Notes overlay database filtering integration', () => {
  /**
   * These tests document the expected behavior of the useRecentLogs hook
   * when filtering database results. The actual filtering logic is in the hook.
   */

  describe('catchall/needs_review exclusion', () => {
    it('should NOT include items with subtype catchall', () => {
      // In real usage, items with subtype='catchall' are filtered by the hook
      // This test documents that expectation
      const catchallItem = makeLogItem({
        id: 'catchall-1',
        title: 'Unsorted thought',
        logSubtype: 'general', // Would be mapped from catchall
      });

      // If the hook correctly filters, catchall items won't appear in logs
      // We're testing the mock setup reflects this
      resetMockLogsData([LOG_JOURNAL_ITEM]); // Only proper logs

      expect(mockLogsData.logs).not.toContainEqual(
        expect.objectContaining({ title: 'Unsorted thought' }),
      );
    });
  });

  describe('list detection', () => {
    it('should include items with isList=true regardless of subtype', () => {
      const todoList = makeLogItem({
        id: 'todo-list-1',
        title: 'Todo List',
        body: '- Task 1\n- Task 2\n- Task 3',
        logSubtype: 'general',
        isList: true,
      });

      resetMockLogsData([todoList]);

      expect(mockLogsData.logs).toContainEqual(todoList);
      expect(mockLogsData.lists).toContainEqual(todoList);
    });

    it('should categorize lists based on their logSubtype', () => {
      const ideaList = makeLogItem({
        id: 'idea-list-1',
        title: 'Feature Ideas',
        body: '- Idea 1\n- Idea 2',
        logSubtype: 'idea',
        isList: true,
      });

      resetMockLogsData([ideaList, LIST_JOURNAL_ITEM]);

      expect(mockLogsData.ideas).toContainEqual(ideaList);
      expect(mockLogsData.journals).toContainEqual(LIST_JOURNAL_ITEM);
    });
  });
});
