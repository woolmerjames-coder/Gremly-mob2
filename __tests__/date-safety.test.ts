/**
 * Date Safety Tests
 *
 * These tests verify that timezone-unsafe date patterns don't exist in the codebase.
 * The ESLint rule handles most of this, but these tests provide extra assurance.
 *
 * CRITICAL BUG PREVENTED:
 * `new Date().toISOString().split('T')[0]` returns UTC date, NOT local date.
 * At 6pm PST, this returns TOMORROW's date (UTC is 8 hours ahead).
 *
 * CORRECT PATTERN:
 * Use `dateService.today()` or `dateService.toLocalDate(date)` instead.
 */

import path from 'path';
import fs from 'fs';

/**
 * Date Safety Tests
 *
 * These tests verify that timezone-unsafe patterns are properly guarded against.
 *
 * KNOWN TECH DEBT:
 * Some legacy files still contain .toISOString().split('T')[0] patterns.
 * These should be migrated to use DateService.today() or DateService.toLocalDate().
 *
 * Files pending migration (tracked in branch sweep-refinements-1.13):
 * - app/spaces/SpaceHomeScreen.tsx (uses targetDate which is already a Date object)
 * - app/screens/SweepTestScreen.tsx (test/dev file)
 * - app/screens/SweepFlowScreen.tsx (uses Date objects from decisions)
 * - app/(dev)/RecentItems.tsx (dev file)
 * - minddrop-voice-bundle/4-backend/cortex-proxy.ts (backend default)
 */

describe('Date Safety - No timezone-unsafe patterns', () => {
  const projectRoot = path.resolve(__dirname, '..');

  // Files that are known to have the pattern but are either:
  // 1. Documentation/comments explaining the bug
  // 2. Dev/test utilities
  // 3. Pending migration (tracked as tech debt)
  const KNOWN_TECH_DEBT_FILES = [
    'SpaceHomeScreen.tsx', // Uses Date objects, not current time - lower risk
    'SweepTestScreen.tsx', // Dev/test screen only
    'SweepFlowScreen.tsx', // Uses Date objects from decisions - needs DateService.toLocalDate()
    'RecentItems.tsx', // Dev screen
    'cortex-proxy.ts', // Backend fallback default
    'DateService.ts', // Documentation comments explaining the bug
    'CreateSpaceModal.tsx', // Uses form.targetDate Date object
    'useGremlyStore.ts', // Uses sixtyDaysAgo Date object for since queries
  ];

  it('no NEW timezone-unsafe patterns introduced (excluding known tech debt)', () => {
    try {
      const { execSync } = require('child_process');
      // Search for the problematic pattern in TypeScript/JavaScript source files
      const result = execSync(
        `grep -r "toISOString()\\s*\\.\\s*split" --include="*.ts" --include="*.tsx" ` +
          `app/ components/ lib/ hooks/ minddrop-voice-bundle/ 2>/dev/null || true`,
        {
          encoding: 'utf8',
          cwd: projectRoot,
        },
      );

      // Filter out test files, comments, and known tech debt
      const lines = result
        .split('\n')
        .filter((line: string) => line.trim())
        .filter((line: string) => !line.includes('.test.'))
        .filter((line: string) => !line.includes('__tests__'))
        .filter((line: string) => !line.includes('// ')) // Skip inline comments
        .filter((line: string) => !line.includes(' * ')) // Skip JSDoc comments
        .filter((line: string) => {
          // Skip known tech debt files
          return !KNOWN_TECH_DEBT_FILES.some((file) => line.includes(file));
        });

      if (lines.length > 0) {
        console.error('Found NEW timezone-unsafe patterns (not in known tech debt):');
        lines.forEach((line: string) => console.error(`  ${line}`));
        console.error('\n⚠️  Use dateService.today() or dateService.toLocalDate(date) instead!\n');
      }

      // No NEW instances should be introduced
      expect(lines).toHaveLength(0);
    } catch (error) {
      // grep returns exit code 1 when no matches found, which is what we want
      if ((error as any).status === 1) {
        // No matches - this is the expected result
        expect(true).toBe(true);
      } else {
        throw error;
      }
    }
  });

  it('tracks known tech debt count (should not increase)', () => {
    try {
      const { execSync } = require('child_process');
      const result = execSync(
        `grep -r "toISOString()\\s*\\.\\s*split" --include="*.ts" --include="*.tsx" ` +
          `app/ components/ lib/ hooks/ minddrop-voice-bundle/ 2>/dev/null || true`,
        {
          encoding: 'utf8',
          cwd: projectRoot,
        },
      );

      const allLines = result
        .split('\n')
        .filter((line: string) => line.trim())
        .filter((line: string) => !line.includes('.test.'))
        .filter((line: string) => !line.includes('__tests__'))
        .filter((line: string) => !line.includes('// '))
        .filter((line: string) => !line.includes(' * '));

      // Current known tech debt count as of sweep-refinements-1.13
      // This number should only go DOWN as we migrate files
      const KNOWN_TECH_DEBT_COUNT = 16;

      if (allLines.length > KNOWN_TECH_DEBT_COUNT) {
        console.error(`Tech debt increased! Was ${KNOWN_TECH_DEBT_COUNT}, now ${allLines.length}`);
        console.error('New occurrences:');
        allLines.forEach((line: string) => console.error(`  ${line}`));
      }

      expect(allLines.length).toBeLessThanOrEqual(KNOWN_TECH_DEBT_COUNT);
    } catch (error) {
      if ((error as any).status === 1) {
        expect(true).toBe(true);
      } else {
        throw error;
      }
    }
  });

  it('ESLint date safety rule is configured', () => {
    // Verify the ESLint config exists and has our custom rule
    const eslintConfigPath = path.join(projectRoot, 'eslint.config.js');

    expect(fs.existsSync(eslintConfigPath)).toBe(true);

    const configContent = fs.readFileSync(eslintConfigPath, 'utf8');
    expect(configContent).toContain('no-restricted-syntax');
    expect(configContent).toContain('toISOString');
  });

  it('pre-commit hook for date patterns is configured', () => {
    const huskyPreCommitPath = path.join(projectRoot, '.husky/pre-commit');

    expect(fs.existsSync(huskyPreCommitPath)).toBe(true);

    const hookContent = fs.readFileSync(huskyPreCommitPath, 'utf8');
    expect(hookContent).toContain('toISOString');
  });
});

describe('DateService usage patterns', () => {
  it('dateService.today() returns local date string', () => {
    // Import and test the actual service
    const { createDateService } = require('../lib/date/DateService');

    // Create service with fixed clock at 6pm PST (which is 2am UTC next day)
    // This is the exact scenario that caused the original bug
    const service = createDateService({
      clock: () => new Date('2025-01-14T18:00:00-08:00'), // 6pm PST Jan 14
    });

    const today = service.today();

    // Should return Jan 14 (local), NOT Jan 15 (UTC)
    expect(today).toBe('2025-01-14');
  });

  it('dateService.today() differs from UTC date in evening PST', () => {
    const { createDateService } = require('../lib/date/DateService');

    // 11pm PST = 7am UTC next day
    const service = createDateService({
      clock: () => new Date('2025-01-14T23:00:00-08:00'), // 11pm PST Jan 14
    });

    const localToday = service.today();
    // eslint-disable-next-line no-restricted-syntax -- Intentionally demonstrating the timezone bug
    const utcDate = new Date('2025-01-14T23:00:00-08:00').toISOString().split('T')[0];

    // Local date should be Jan 14
    expect(localToday).toBe('2025-01-14');

    // UTC date would be Jan 15 - THIS IS THE BUG WE PREVENT
    expect(utcDate).toBe('2025-01-15');

    // They should NOT be equal in this timezone scenario
    expect(localToday).not.toBe(utcDate);
  });
});
