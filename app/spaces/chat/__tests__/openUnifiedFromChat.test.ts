/**
 * Unit tests for openUnifiedFromChat utilities.
 */

import { saveableTypeToOverlayKind } from '../openUnifiedFromChat';

describe('openUnifiedFromChat', () => {
  describe('saveableTypeToOverlayKind', () => {
    test('"todo" maps to "todo"', () => {
      expect(saveableTypeToOverlayKind('todo')).toBe('todo');
    });

    test('"habit" maps to "habit"', () => {
      expect(saveableTypeToOverlayKind('habit')).toBe('habit');
    });

    test('"log-general" maps to "note"', () => {
      expect(saveableTypeToOverlayKind('log-general')).toBe('note');
    });

    test('"log-list" maps to "note"', () => {
      expect(saveableTypeToOverlayKind('log-list')).toBe('note');
    });

    test('"log-idea" maps to "note"', () => {
      expect(saveableTypeToOverlayKind('log-idea')).toBe('note');
    });

    test('undefined falls back to "note"', () => {
      expect(saveableTypeToOverlayKind(undefined as any)).toBe('note');
    });

    test('null falls back to "note"', () => {
      expect(saveableTypeToOverlayKind(null as any)).toBe('note');
    });

    test('unknown type falls back to "note"', () => {
      expect(saveableTypeToOverlayKind('unknown-type')).toBe('note');
    });

    test('empty string falls back to "note"', () => {
      expect(saveableTypeToOverlayKind('')).toBe('note');
    });
  });
});
