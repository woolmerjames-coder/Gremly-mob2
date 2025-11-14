import fs from 'fs';
import path from 'path';
import glob from 'glob';

// CI test: ensure no files import UnifiedCreateOverlay directly
test('no direct UnifiedCreateOverlay imports', () => {
  // Search source files across the repo (exclude common folders)
  const files = glob.sync('**/*.{ts,tsx,js,jsx}', {
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/ios/**',
      '**/android/**',
      '**/.expo/**',
      '**/artifacts/**',
      '**/*.d.ts',
    ],
  });

  const bad = files.filter((f) => {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      return /UnifiedCreateOverlay/.test(txt);
    } catch (e) {
      return false;
    }
  });

  if (bad.length) {
    // Print helpful failure message listing offending files
    console.error('Forbidden UnifiedCreateOverlay imports found in:');
    bad.forEach((b) => console.error(`  - ${b}`));
  }

  expect(bad).toEqual([]);
});
