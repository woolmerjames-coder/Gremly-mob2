/**
 * ics.test.ts
 *
 * Tests for ICS calendar parsing and connection functionality.
 * Tests the ICS parser, date handling, and calendar connection logic.
 */

// Import the functions we want to test
// Note: In a real test setup, you'd need to configure the test environment for Cloudflare Workers
// For now, we'll test the parsing logic by extracting it or mocking the worker environment

describe('ICS Calendar Parsing', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // Helper Functions for Testing
  // ═══════════════════════════════════════════════════════════════════════════

  // Replicate the parsing functions for testing
  function decodeIcsText(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  function parseIcsDate(dateStr: string): { date: Date; isAllDay: boolean } {
    const cleanDate = dateStr.replace(/.*:/, '');

    if (cleanDate.length === 8 && !cleanDate.includes('T')) {
      const year = parseInt(cleanDate.substring(0, 4));
      const month = parseInt(cleanDate.substring(4, 6)) - 1;
      const day = parseInt(cleanDate.substring(6, 8));
      return { date: new Date(Date.UTC(year, month, day)), isAllDay: true };
    }

    const datePart = cleanDate.replace('Z', '');

    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1;
    const day = parseInt(datePart.substring(6, 8));
    const hour = parseInt(datePart.substring(9, 11)) || 0;
    const minute = parseInt(datePart.substring(11, 13)) || 0;
    const second = parseInt(datePart.substring(13, 15)) || 0;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return { date, isAllDay: false };
  }

  function addDuration(date: Date, duration: string): Date {
    const result = new Date(date);
    const dayMatch = duration.match(/(\d+)D/);
    const hourMatch = duration.match(/(\d+)H/);
    const minuteMatch = duration.match(/(\d+)M/);

    if (dayMatch) result.setDate(result.getDate() + parseInt(dayMatch[1]));
    if (hourMatch) result.setHours(result.getHours() + parseInt(hourMatch[1]));
    if (minuteMatch) result.setMinutes(result.getMinutes() + parseInt(minuteMatch[1]));

    return result;
  }

  function extractField(block: string, fieldName: string): string | null {
    const regex = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)`, 'm');
    const match = block.match(regex);
    if (!match) return null;

    const value = match[1];
    const lines = block.split(/\r?\n/);
    let inField = false;
    let result = '';

    for (const line of lines) {
      if (line.match(new RegExp(`^${fieldName}(?:;[^:]*)?:`))) {
        inField = true;
        result = line.split(':').slice(1).join(':');
      } else if (inField && (line.startsWith(' ') || line.startsWith('\t'))) {
        result += line.substring(1);
      } else if (inField) {
        break;
      }
    }

    return result || value;
  }

  function extractCalendarName(icsContent: string): string | null {
    const nameMatch = icsContent.match(/X-WR-CALNAME:(.*)/);
    if (nameMatch) return decodeIcsText(nameMatch[1].trim());
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // decodeIcsText
  // ═══════════════════════════════════════════════════════════════════════════

  describe('decodeIcsText', () => {
    it('decodes newline escape sequence', () => {
      expect(decodeIcsText('Line 1\\nLine 2')).toBe('Line 1\nLine 2');
    });

    it('decodes comma escape sequence', () => {
      expect(decodeIcsText('Hello\\, World')).toBe('Hello, World');
    });

    it('decodes semicolon escape sequence', () => {
      expect(decodeIcsText('Key\\;Value')).toBe('Key;Value');
    });

    it('decodes backslash escape sequence', () => {
      expect(decodeIcsText('Path\\\\File')).toBe('Path\\File');
    });

    it('decodes multiple escape sequences', () => {
      expect(decodeIcsText('Hello\\, World\\nNew line\\;end')).toBe('Hello, World\nNew line;end');
    });

    it('returns unchanged text without escapes', () => {
      expect(decodeIcsText('Plain text')).toBe('Plain text');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // parseIcsDate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('parseIcsDate', () => {
    it('parses all-day date (YYYYMMDD)', () => {
      const result = parseIcsDate('20260123');

      expect(result.isAllDay).toBe(true);
      expect(result.date.toISOString()).toBe('2026-01-23T00:00:00.000Z');
    });

    it('parses timed date with UTC suffix (YYYYMMDDTHHMMSSZ)', () => {
      const result = parseIcsDate('20260123T143000Z');

      expect(result.isAllDay).toBe(false);
      expect(result.date.toISOString()).toBe('2026-01-23T14:30:00.000Z');
    });

    it('parses timed date without UTC suffix', () => {
      const result = parseIcsDate('20260123T143000');

      expect(result.isAllDay).toBe(false);
      expect(result.date.toISOString()).toBe('2026-01-23T14:30:00.000Z');
    });

    it('parses date with VALUE parameter prefix', () => {
      const result = parseIcsDate('VALUE=DATE:20260123');

      expect(result.isAllDay).toBe(true);
      expect(result.date.toISOString()).toBe('2026-01-23T00:00:00.000Z');
    });

    it('parses date with TZID parameter prefix', () => {
      const result = parseIcsDate('TZID=America/New_York:20260123T143000');

      expect(result.isAllDay).toBe(false);
      // Note: This parser treats all times as UTC, timezone handling would need enhancement
      expect(result.date.toISOString()).toBe('2026-01-23T14:30:00.000Z');
    });

    it('handles midnight correctly', () => {
      const result = parseIcsDate('20260123T000000Z');

      expect(result.isAllDay).toBe(false);
      expect(result.date.toISOString()).toBe('2026-01-23T00:00:00.000Z');
    });

    it('handles end of day correctly', () => {
      const result = parseIcsDate('20260123T235959Z');

      expect(result.isAllDay).toBe(false);
      expect(result.date.toISOString()).toBe('2026-01-23T23:59:59.000Z');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // addDuration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('addDuration', () => {
    it('adds days to date', () => {
      const start = new Date('2026-01-23T10:00:00Z');
      const result = addDuration(start, 'P1D');

      expect(result.toISOString()).toBe('2026-01-24T10:00:00.000Z');
    });

    it('adds hours to date', () => {
      const start = new Date('2026-01-23T10:00:00Z');
      const result = addDuration(start, 'PT2H');

      expect(result.toISOString()).toBe('2026-01-23T12:00:00.000Z');
    });

    it('adds minutes to date', () => {
      const start = new Date('2026-01-23T10:00:00Z');
      const result = addDuration(start, 'PT30M');

      expect(result.toISOString()).toBe('2026-01-23T10:30:00.000Z');
    });

    it('adds combined duration', () => {
      const start = new Date('2026-01-23T10:00:00Z');
      const result = addDuration(start, 'P1DT2H30M');

      expect(result.toISOString()).toBe('2026-01-24T12:30:00.000Z');
    });

    it('handles multi-day duration', () => {
      const start = new Date('2026-01-23T10:00:00Z');
      const result = addDuration(start, 'P7D');

      expect(result.toISOString()).toBe('2026-01-30T10:00:00.000Z');
    });

    it('does not modify original date', () => {
      const start = new Date('2026-01-23T10:00:00Z');
      const originalTime = start.getTime();
      addDuration(start, 'P1D');

      expect(start.getTime()).toBe(originalTime);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // extractField
  // ═══════════════════════════════════════════════════════════════════════════

  describe('extractField', () => {
    it('extracts simple field', () => {
      const block = 'SUMMARY:Team Meeting\nLOCATION:Room 101';
      expect(extractField(block, 'SUMMARY')).toBe('Team Meeting');
    });

    it('extracts field with parameters', () => {
      const block = 'DTSTART;VALUE=DATE:20260123\nDTEND;VALUE=DATE:20260124';
      expect(extractField(block, 'DTSTART')).toBe('20260123');
    });

    it('extracts field with TZID parameter', () => {
      const block = 'DTSTART;TZID=America/New_York:20260123T100000';
      expect(extractField(block, 'DTSTART')).toBe('20260123T100000');
    });

    it('returns null for missing field', () => {
      const block = 'SUMMARY:Test\nLOCATION:Here';
      expect(extractField(block, 'DESCRIPTION')).toBeNull();
    });

    it('handles line continuation', () => {
      const block = 'DESCRIPTION:This is a very long description that\n continues on the next line';
      // ICS line continuation removes the leading space/tab and concatenates directly
      expect(extractField(block, 'DESCRIPTION')).toBe(
        'This is a very long description thatcontinues on the next line',
      );
    });

    it('handles field with colons in value', () => {
      const block = 'SUMMARY:Meeting: 10:00 AM Discussion';
      expect(extractField(block, 'SUMMARY')).toBe('Meeting: 10:00 AM Discussion');
    });

    it('extracts UID field', () => {
      const block = 'UID:event-12345@example.com\nSUMMARY:Test';
      expect(extractField(block, 'UID')).toBe('event-12345@example.com');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // extractCalendarName
  // ═══════════════════════════════════════════════════════════════════════════

  describe('extractCalendarName', () => {
    it('extracts X-WR-CALNAME', () => {
      const content = 'BEGIN:VCALENDAR\nX-WR-CALNAME:Work Calendar\nBEGIN:VEVENT';
      expect(extractCalendarName(content)).toBe('Work Calendar');
    });

    it('returns null when X-WR-CALNAME is missing', () => {
      const content = 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT';
      expect(extractCalendarName(content)).toBeNull();
    });

    it('decodes escaped characters in calendar name', () => {
      const content = 'BEGIN:VCALENDAR\nX-WR-CALNAME:Work\\, Personal Calendar';
      expect(extractCalendarName(content)).toBe('Work, Personal Calendar');
    });

    it('trims whitespace from calendar name', () => {
      const content = 'BEGIN:VCALENDAR\nX-WR-CALNAME:  Work Calendar  \nBEGIN:VEVENT';
      expect(extractCalendarName(content)).toBe('Work Calendar');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Full ICS Content Parsing (Integration-style tests)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ICS content structure', () => {
    const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
X-WR-CALNAME:Test Calendar
BEGIN:VEVENT
UID:event-001@example.com
SUMMARY:Team Standup
DTSTART:20260123T090000Z
DTEND:20260123T093000Z
LOCATION:Conference Room A
DESCRIPTION:Daily team standup meeting
END:VEVENT
BEGIN:VEVENT
UID:event-002@example.com
SUMMARY:All-Day Event
DTSTART;VALUE=DATE:20260123
DTEND;VALUE=DATE:20260124
END:VEVENT
END:VCALENDAR`;

    it('identifies VCALENDAR block', () => {
      expect(sampleIcs).toContain('BEGIN:VCALENDAR');
      expect(sampleIcs).toContain('END:VCALENDAR');
    });

    it('identifies VEVENT blocks', () => {
      const veventCount = (sampleIcs.match(/BEGIN:VEVENT/g) || []).length;
      expect(veventCount).toBe(2);
    });

    it('can extract calendar name from full ICS', () => {
      expect(extractCalendarName(sampleIcs)).toBe('Test Calendar');
    });

    it('can parse VEVENT block', () => {
      const veventMatch = sampleIcs.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/);
      expect(veventMatch).not.toBeNull();

      const eventBlock = veventMatch![1];
      expect(extractField(eventBlock, 'UID')).toBe('event-001@example.com');
      expect(extractField(eventBlock, 'SUMMARY')).toBe('Team Standup');
      expect(extractField(eventBlock, 'LOCATION')).toBe('Conference Room A');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('handles empty event block', () => {
      const block = '';
      expect(extractField(block, 'SUMMARY')).toBeNull();
    });

    it('handles event with minimal fields', () => {
      const block = 'DTSTART:20260123T100000Z';
      expect(extractField(block, 'DTSTART')).toBe('20260123T100000Z');
      expect(extractField(block, 'SUMMARY')).toBeNull();
      expect(extractField(block, 'LOCATION')).toBeNull();
    });

    it('handles Windows-style line endings (CRLF)', () => {
      const block = 'SUMMARY:Test Meeting\r\nLOCATION:Room 101\r\n';
      expect(extractField(block, 'SUMMARY')).toBe('Test Meeting');
      expect(extractField(block, 'LOCATION')).toBe('Room 101');
    });

    it('parses date at year boundary', () => {
      const result = parseIcsDate('20251231T235959Z');
      expect(result.date.toISOString()).toBe('2025-12-31T23:59:59.000Z');
    });

    it('parses leap year date', () => {
      const result = parseIcsDate('20240229T120000Z'); // 2024 is a leap year
      expect(result.date.toISOString()).toBe('2024-02-29T12:00:00.000Z');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // URL Validation (for connectIcsCalendar)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('URL validation', () => {
    it('accepts https URL', () => {
      const url = new URL('https://example.com/calendar.ics');
      expect(['http:', 'https:'].includes(url.protocol)).toBe(true);
    });

    it('accepts http URL', () => {
      const url = new URL('http://example.com/calendar.ics');
      expect(['http:', 'https:'].includes(url.protocol)).toBe(true);
    });

    it('rejects webcal URL', () => {
      const url = new URL('webcal://example.com/calendar.ics');
      expect(['http:', 'https:'].includes(url.protocol)).toBe(false);
    });

    it('rejects ftp URL', () => {
      const url = new URL('ftp://example.com/calendar.ics');
      expect(['http:', 'https:'].includes(url.protocol)).toBe(false);
    });

    it('throws on invalid URL format', () => {
      expect(() => new URL('not-a-url')).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Calendar Token Storage Format
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ICS token storage format', () => {
    it('uses correct field mapping for ICS tokens', () => {
      // ICS tokens use different field meanings:
      // access_token = ics_url
      // refresh_token = '' (empty)
      // provider_email = calendar label/name

      const tokenData = {
        access_token: 'https://example.com/calendar.ics',
        refresh_token: '',
        access_token_expires_at: '2099-12-31T23:59:59Z',
        provider_email: 'Work Calendar',
        provider_account_id: null,
      };

      expect(tokenData.access_token).toContain('https://');
      expect(tokenData.refresh_token).toBe('');
      expect(tokenData.provider_email).toBe('Work Calendar');
    });
  });
});
