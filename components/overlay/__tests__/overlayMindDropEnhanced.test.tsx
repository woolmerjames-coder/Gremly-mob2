/**
 * Tests for Phase 6: Enhanced Mind Drop Prefill Detection
 *
 * These tests cover two key enhancements:
 * 1. Enhanced isRawSentenceTitle() detection for todos/habits created from Mind Drop
 * 2. filterMindDropTodoTags() "Book [appointment]" heuristic
 */

import { filterMindDropTodoTags } from '../overlayV2.mapping';

describe('filterMindDropTodoTags - "Book [appointment]" heuristic', () => {
  describe('Booking patterns (should strip "book" tag)', () => {
    it('should strip "book" tag for "Book doctor appointment"', () => {
      const text = 'Book doctor appointment';
      const tags = ['book', 'doctor', 'appointment'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['doctor', 'appointment']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book a dentist"', () => {
      const text = 'Book a dentist';
      const tags = ['book', 'dentist', 'health'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['dentist', 'health']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book the haircut tomorrow"', () => {
      const text = 'Book the haircut tomorrow';
      const tags = ['book', 'haircut', 'tomorrow'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['haircut', 'tomorrow']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book an appointment"', () => {
      const text = 'Book an appointment';
      const tags = ['book', 'appointment', 'health'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['appointment', 'health']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book flight to London"', () => {
      const text = 'Book flight to London';
      const tags = ['book', 'flight', 'travel', 'london'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['flight', 'travel', 'london']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book a table at restaurant"', () => {
      const text = 'Book a table at restaurant';
      const tags = ['book', 'table', 'restaurant', 'dinner'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['table', 'restaurant', 'dinner']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book massage"', () => {
      const text = 'Book massage';
      const tags = ['book', 'massage', 'wellness'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['massage', 'wellness']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book hotel room"', () => {
      const text = 'Book hotel room';
      const tags = ['book', 'hotel', 'travel'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['hotel', 'travel']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book car rental"', () => {
      const text = 'Book car rental';
      const tags = ['book', 'car', 'travel'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['car', 'travel']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book tickets for concert"', () => {
      const text = 'Book tickets for concert';
      const tags = ['book', 'tickets', 'concert', 'entertainment'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['tickets', 'concert', 'entertainment']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book spa appointment"', () => {
      const text = 'Book spa appointment';
      const tags = ['book', 'spa', 'appointment', 'wellness'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['spa', 'appointment', 'wellness']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book consultation with lawyer"', () => {
      const text = 'Book consultation with lawyer';
      const tags = ['book', 'consultation', 'lawyer', 'legal'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['consultation', 'lawyer', 'legal']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book meeting with client"', () => {
      const text = 'Book meeting with client';
      const tags = ['book', 'meeting', 'client', 'work'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['meeting', 'client', 'work']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" tag for "Book a call"', () => {
      const text = 'Book a call';
      const tags = ['book', 'call', 'phone'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['call', 'phone']);
      expect(result).not.toContain('book');
    });
  });

  describe('Non-booking patterns (should NOT strip "book" tag)', () => {
    it('should keep "book" tag for "Read this book"', () => {
      const text = 'Read this book';
      const tags = ['book', 'reading'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'reading']);
      expect(result).toContain('book');
    });

    it('should keep "book" tag for "Buy book on gardening"', () => {
      const text = 'Buy book on gardening';
      const tags = ['book', 'gardening', 'shopping'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'gardening', 'shopping']);
      expect(result).toContain('book');
    });

    it('should keep "book" tag for "Return book to library"', () => {
      const text = 'Return book to library';
      const tags = ['book', 'library'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'library']);
      expect(result).toContain('book');
    });

    it('should keep "book" tag for "Finish reading book"', () => {
      const text = 'Finish reading book';
      const tags = ['book', 'reading'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'reading']);
      expect(result).toContain('book');
    });

    it('should keep "book" tag when text does not start with "book"', () => {
      const text = 'Need to book later';
      const tags = ['book', 'reminder'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'reminder']);
      expect(result).toContain('book');
    });

    it('should keep "book" tag for "Write a book"', () => {
      const text = 'Write a book';
      const tags = ['book', 'writing'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'writing']);
      expect(result).toContain('book');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text gracefully', () => {
      const text = '';
      const tags = ['book', 'appointment'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'appointment']);
    });

    it('should handle empty tags array', () => {
      const text = 'Book doctor appointment';
      const tags: string[] = [];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual([]);
    });

    it('should handle text with only whitespace', () => {
      const text = '   ';
      const tags = ['book', 'appointment'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['book', 'appointment']);
    });

    it('should handle tags without "book"', () => {
      const text = 'Book doctor appointment';
      const tags = ['doctor', 'appointment'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['doctor', 'appointment']);
    });

    it('should be case-insensitive for text matching', () => {
      const text = 'BOOK DOCTOR APPOINTMENT';
      const tags = ['book', 'doctor'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['doctor']);
      expect(result).not.toContain('book');
    });

    it('should handle mixed case tags', () => {
      const text = 'Book doctor appointment';
      const tags = ['Book', 'Doctor', 'Appointment'];
      const result = filterMindDropTodoTags(text, tags);
      // Should normalize "Book" → "book" and strip it
      expect(result.map((t) => t.toLowerCase())).toEqual(['doctor', 'appointment']);
    });

    it('should preserve tags with prefixes (#, @, *)', () => {
      const text = 'Book doctor appointment';
      const tags = ['#book', '@doctor', '*appointment'];
      const result = filterMindDropTodoTags(text, tags);
      // filterMindDropTodoTags normalizes tags (strips prefixes for comparison)
      expect(result).not.toContain('#book');
      expect(result).not.toContain('book');
      // But keeps other tags
      expect(result.length).toBe(2);
    });

    it('should handle text with multiple "book" occurrences', () => {
      const text = 'Book a doctor to book later';
      const tags = ['book', 'doctor'];
      const result = filterMindDropTodoTags(text, tags);
      // Should strip because text STARTS with "Book " followed by appointment word
      expect(result).toEqual(['doctor']);
    });

    it('should handle appointment word in different position', () => {
      const text = 'Book something for doctor later';
      const tags = ['book', 'doctor'];
      const result = filterMindDropTodoTags(text, tags);
      // Should NOT strip because "something" is not an appointment word
      expect(result).toEqual(['book', 'doctor']);
    });

    it('should handle "book" tag when not present but text matches', () => {
      const text = 'Book doctor appointment';
      const tags = ['doctor', 'health'];
      const result = filterMindDropTodoTags(text, tags);
      // No "book" tag to strip
      expect(result).toEqual(['doctor', 'health']);
    });
  });

  describe('Complex booking scenarios', () => {
    it('should strip "book" for "Book a time slot"', () => {
      const text = 'Book a time slot';
      const tags = ['book', 'time', 'scheduling'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['time', 'scheduling']);
      expect(result).not.toContain('book');
    });

    it('should strip "book" for "Book reservation"', () => {
      const text = 'Book reservation';
      const tags = ['book', 'reservation', 'restaurant'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['reservation', 'restaurant']);
      expect(result).not.toContain('book');
    });

    it('should preserve weekday tags when stripping "book"', () => {
      const text = 'Book doctor appointment';
      const tags = ['book', 'doctor', 'monday', 'health'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['doctor', 'monday', 'health']);
      expect(result).toContain('monday');
      expect(result).not.toContain('book');
    });

    it('should preserve time tags when stripping "book"', () => {
      const text = 'Book dentist';
      const tags = ['book', 'dentist', 'tomorrow', '3pm'];
      const result = filterMindDropTodoTags(text, tags);
      expect(result).toEqual(['dentist', 'tomorrow', '3pm']);
      expect(result).not.toContain('book');
    });
  });
});
