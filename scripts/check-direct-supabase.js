#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Check for direct Supabase calls outside lib/repo/**
 * This enforces the repository pattern by preventing direct database access
 * from UI components, screens, and providers.
 *
 * Usage: node scripts/check-direct-supabase.js
 * Exit code: 0 if clean, 1 if violations found
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const _ALLOWED_PATTERNS = ['lib/repo/**', '**/*.test.ts', '**/*.test.tsx', '__tests__/**'];

const RESTRICTED_DIRS = ['app/**', 'providers/**', 'components/**', 'screens/**'];

// Files that are exempt (e.g., setup files, configs)
const EXEMPTED_FILES = ['lib/supabase/client.ts', 'lib/supabase/auth.ts', 'jest-setup.ts'];

console.log('🔍 Checking for direct Supabase calls outside lib/repo/**\n');

let violations = [];

// Search for supabase.from( in restricted directories
for (const pattern of RESTRICTED_DIRS) {
  try {
    // Use grep to find violations (faster than reading all files)
    const grepPattern = pattern.replace('**', '*');
    const searchPath = path.join(process.cwd(), grepPattern);

    // Check if directory exists
    if (!fs.existsSync(searchPath.replace('/*', ''))) {
      continue;
    }

    const result = execSync(
      `grep -r "supabase\\.from(" ${grepPattern} --include="*.ts" --include="*.tsx" || true`,
      { encoding: 'utf8', cwd: process.cwd() },
    );

    if (result.trim()) {
      const lines = result.trim().split('\n');
      for (const line of lines) {
        const [filePath, ...rest] = line.split(':');
        const cleanPath = filePath.trim();

        // Skip exempted files
        if (EXEMPTED_FILES.some((exempt) => cleanPath.endsWith(exempt))) {
          continue;
        }

        // Skip test files
        if (cleanPath.includes('.test.') || cleanPath.includes('__tests__')) {
          continue;
        }

        // Skip files in lib/repo/
        if (cleanPath.includes('lib/repo/')) {
          continue;
        }

        violations.push({
          file: cleanPath,
          line: rest.join(':'),
        });
      }
    }
  } catch (error) {
    // grep returns non-zero exit code when no matches found - this is OK
    if (error.status !== 1) {
      console.error(`Error searching ${pattern}:`, error.message);
    }
  }
}

if (violations.length > 0) {
  console.error('❌ Found direct Supabase calls outside lib/repo/**:\n');
  violations.forEach(({ file, line }) => {
    console.error(`  ${file}`);
    console.error(`    ${line.trim()}\n`);
  });

  console.error('\n📚 Repository Pattern Violation:');
  console.error('   All database access should go through lib/repo/ interfaces.');
  console.error('   Use useRepo() hook in components and screens.\n');
  console.error('   See lib/repo/IRepo.ts for available methods.\n');

  process.exit(1);
} else {
  console.log('✅ No direct Supabase calls found outside lib/repo/');
  console.log('   Repository pattern is properly maintained.\n');
  process.exit(0);
}
