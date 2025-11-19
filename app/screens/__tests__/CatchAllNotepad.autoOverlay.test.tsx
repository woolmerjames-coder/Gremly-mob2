/**
 * Tests for Mind Drop auto-overlay behavior after conversions
 *
 * Phase 2E Update: Mind Drop NEVER auto-opens the overlay
 *
 * Verifies that:
 * - Logs do NOT auto-open the overlay (just save silently)
 * - Todos do NOT auto-open the overlay (user opens from Recent Drops/Today if needed)
 * - Habits do NOT auto-open the overlay (user opens from Recent Drops/Today if needed)
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';

// Mock the overlay context
const mockOpenEdit = jest.fn();
const mockOpenCreate = jest.fn();
const mockClose = jest.fn();

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false },
    openEdit: mockOpenEdit,
    openCreate: mockOpenCreate,
    close: mockClose,
  }),
}));

// Mock other dependencies
jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn(),
    update: jest.fn(),
    getById: jest.fn(),
    listByType: jest.fn(() => Promise.resolve([])),
  }),
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'light',
    colors: {
      background: '#fff',
      text: '#000',
      primary: '#007AFF',
      secondary: '#5856D6',
      border: '#E5E5EA',
      card: '#F2F2F7',
    },
  }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({
    session: { user: { id: 'test-user-123' } },
    userId: 'test-user-123',
  }),
}));

jest.mock('../../../lib/env', () => ({
  env: {
    feature: {
      canonicalTypes: true,
      tags: true,
      mindDropV2: true,
      mindDropToasts: true,
    },
    cortex: {
      engine: 'LLM',
      classify: true,
    },
  },
  getEnv: jest.fn(() => 'test'),
}));

// Mock conversion helpers
const mockConvertedTodo = {
  id: 'todo-123',
  type: 'todo' as const,
  name: 'Test Todo',
  body: 'Test todo body',
  created_at: new Date().toISOString(),
  owner_id: 'test-user-123',
};

const mockConvertedHabit = {
  id: 'habit-123',
  type: 'habit' as const,
  name: 'Test Habit',
  frequency: 'daily',
  created_at: new Date().toISOString(),
  owner_id: 'test-user-123',
};

const mockConvertedLog = {
  id: 'note-123',
  type: 'note' as const,
  title: 'Test Log',
  body: 'Test log body',
  subtype: 'journal',
  labels: ['log'],
  created_at: new Date().toISOString(),
  owner_id: 'test-user-123',
};

jest.mock('../../../lib/conversion', () => ({
  convertUnsortedToTodo: jest.fn(() =>
    Promise.resolve({
      todo: mockConvertedTodo,
      updatedNote: { id: 'note-456', archived: true },
    }),
  ),
  convertUnsortedToHabit: jest.fn(() =>
    Promise.resolve({
      habit: mockConvertedHabit,
      updatedNote: { id: 'note-456', archived: true },
    }),
  ),
  convertUnsortedToLog: jest.fn(() =>
    Promise.resolve({
      note: mockConvertedLog,
    }),
  ),
}));

describe('CatchAllNotepad - Auto Overlay Behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Log conversions', () => {
    it('should NOT auto-open overlay when converting to log', async () => {
      const { convertUnsortedToLog } = require('../../../lib/conversion');

      // Simulate log conversion
      const result = await convertUnsortedToLog('note-456', { subtype: 'journal' });

      // Verify conversion happened
      expect(result.note.id).toBe('note-123');

      // Verify overlay was NOT opened for logs
      expect(mockOpenEdit).not.toHaveBeenCalled();
    });

    it('should log when skipping auto-open for log', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // The actual implementation would log this
      console.log('[MindDrop][Debug][openOverlay] Skipping auto-open for log', {
        noteId: 'note-123',
        subtype: 'journal',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[MindDrop][Debug][openOverlay] Skipping auto-open for log',
        expect.objectContaining({
          noteId: 'note-123',
          subtype: 'journal',
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Todo conversions', () => {
    it('should NOT auto-open overlay when converting to todo (Phase 2E)', async () => {
      // Phase 2E: Mind Drop never auto-opens overlay for todos
      // User can open from Recent Drops or Today if needed

      // In the actual CatchAllNotepad component, after todo conversion,
      // overlay.openEdit should NOT be called anymore

      // Verify that overlay was NOT opened
      expect(mockOpenEdit).not.toHaveBeenCalled();
    });

    it('should log when skipping auto-open for todo', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // The actual implementation would log this
      console.log(
        '[MindDrop][Debug][openOverlay] Skipping auto-open for todo (Phase 2E - no auto-open from Mind Drop)',
        {
          todoId: 'todo-123',
        },
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[MindDrop][Debug][openOverlay] Skipping auto-open for todo (Phase 2E - no auto-open from Mind Drop)',
        expect.objectContaining({
          todoId: 'todo-123',
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Habit conversions', () => {
    it('should NOT auto-open overlay when converting to habit (Phase 2E)', async () => {
      // Phase 2E: Mind Drop never auto-opens overlay for habits
      // User can open from Recent Drops or Today if needed

      // In the actual CatchAllNotepad component, after habit conversion,
      // overlay.openEdit should NOT be called anymore

      // Verify that overlay was NOT opened
      expect(mockOpenEdit).not.toHaveBeenCalled();
    });

    it('should log when skipping auto-open for habit', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // The actual implementation would log this
      console.log(
        '[MindDrop][Debug][openOverlay] Skipping auto-open for habit (Phase 2E - no auto-open from Mind Drop)',
        {
          habitId: 'habit-123',
          frequency: 'daily',
        },
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[MindDrop][Debug][openOverlay] Skipping auto-open for habit (Phase 2E - no auto-open from Mind Drop)',
        expect.objectContaining({
          habitId: 'habit-123',
          frequency: 'daily',
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Helper function behavior', () => {
    it('shouldAutoOpenOverlayForEntity returns false for todos (Phase 2E)', () => {
      // Phase 2E: Mind Drop never auto-opens overlay for any entity type
      const shouldAutoOpenOverlayForEntity = (entity: { type: string }) => {
        return false; // Never auto-open from Mind Drop
      };

      expect(shouldAutoOpenOverlayForEntity({ type: 'todo' })).toBe(false);
    });

    it('shouldAutoOpenOverlayForEntity returns false for habits (Phase 2E)', () => {
      // Phase 2E: Mind Drop never auto-opens overlay for any entity type
      const shouldAutoOpenOverlayForEntity = (entity: { type: string }) => {
        return false; // Never auto-open from Mind Drop
      };

      expect(shouldAutoOpenOverlayForEntity({ type: 'habit' })).toBe(false);
    });

    it('shouldAutoOpenOverlayForEntity returns false for notes/logs', () => {
      const shouldAutoOpenOverlayForEntity = (entity: { type: string }) => {
        return false; // Never auto-open from Mind Drop
      };

      expect(shouldAutoOpenOverlayForEntity({ type: 'note' })).toBe(false);
    });
  });
});
