/**
 * check-worlds-boundary.mjs
 *
 * Enforces physical code isolation between the new Worlds & Chapters v2
 * classifier modules and the existing Life Map pipeline.
 *
 * Worlds & Chapters v2 Phase 1 non-negotiable:
 *   The signal collectors and worlds classifier modules MUST NOT import any
 *   Life Map functions (bootstrapLifeMap, rebuildLifeMap, runUnifiedAnalyst,
 *   updateLifeMapAndFocus, generateHeadlineFromFocus,
 *   fetchFullHistoricalSnapshot). Equally, the Life Map host bundles MUST NOT
 *   import classifier modules (signalCollector, lifeContextSignalCollector,
 *   worldsClassifier). Any such coupling would merge two architecturally
 *   separate pipelines, causing hidden data-flow dependencies and making
 *   independent deployment or rollback impossible.
 *
 * Usage:  node scripts/check-worlds-boundary.mjs
 * Exits:  0 if clean, 1 if any boundary violation is found.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Glob-like patterns for classifier source files.
 * Expanded manually with fs.readdirSync — no glob library needed.
 */
const CLASSIFIER_FILE_PATTERNS = [
  'workers/inngest-jobs/signalCollector.{ts,js,mjs}',
  'workers/inngest-jobs/lifeContextSignalCollector.{ts,js,mjs}',
  'workers/inngest-jobs/worldsClassifier.{ts,js,mjs}',
  'workers/inngest-jobs/worldsHarness.{ts,js,mjs}',
  'workers/inngest-jobs/src/signalCollector.{ts,js}',
  'workers/inngest-jobs/src/lifeContextSignalCollector.{ts,js}',
  'workers/inngest-jobs/src/worldsClassifier.{ts,js}',
];

/** Life Map compiled host bundles that must not import classifier modules. */
const LIFEMAP_HOST_FILES = [
  'workers/inngest-jobs/index.js',
  'workers/inngest-jobs/index.ts',
  'workers/inngest-jobs/src/index.ts',
];

/** Life Map function names that classifier modules must never import. */
const LIFEMAP_FUNCTION_NAMES = [
  'bootstrapLifeMap',
  'rebuildLifeMap',
  'runUnifiedAnalyst',
  'updateLifeMapAndFocus',
  'generateHeadlineFromFocus',
  'fetchFullHistoricalSnapshot',
];

/** Path fragments that must not appear in Life Map host import lines. */
const CLASSIFIER_PATH_FRAGMENTS = [
  'signalCollector',
  'lifeContextSignalCollector',
  'worldsClassifier',
  'worldsHarness',
];

// ---------------------------------------------------------------------------
// Glob expansion (no external library)
// ---------------------------------------------------------------------------

/**
 * Expands a single pattern like "dir/prefix*.{ts,js,mjs}" into matching
 * absolute file paths that exist on disk.
 */
function expandPattern(pattern) {
  const fullPattern = path.join(ROOT, pattern);

  // Split brace alternatives, e.g. "{ts,js,mjs}" → ["ts","js","mjs"]
  const braceMatch = fullPattern.match(/\{([^}]+)\}/);
  const candidates = braceMatch
    ? braceMatch[1].split(',').map((ext) => fullPattern.replace(/\{[^}]+\}/, ext.trim()))
    : [fullPattern];

  // Handle trailing glob (*) in the base name
  const results = [];
  for (const candidate of candidates) {
    const dir = path.dirname(candidate);
    const base = path.basename(candidate);

    if (base.includes('*')) {
      const prefix = base.slice(0, base.indexOf('*'));
      const suffix = base.slice(base.indexOf('*') + 1);
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith(prefix) && entry.endsWith(suffix)) {
          results.push(path.join(dir, entry));
        }
      }
    } else {
      if (fs.existsSync(candidate)) results.push(candidate);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

const IMPORT_LINE_RE = /^\s*import\b/;

function isImportLine(line) {
  return IMPORT_LINE_RE.test(line) || line.includes('require(');
}

function scanFile(filePath, violationFn) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isImportLine(line)) {
      violationFn(i + 1, line); // 1-based line numbers
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const violations = [];

// 1. Classifier files must not import Life Map functions
const classifierFiles = CLASSIFIER_FILE_PATTERNS.flatMap(expandPattern);

for (const filePath of classifierFiles) {
  scanFile(filePath, (lineNumber, lineText) => {
    for (const fn of LIFEMAP_FUNCTION_NAMES) {
      if (lineText.includes(fn)) {
        violations.push({ file: path.relative(ROOT, filePath), lineNumber, lineText });
        break; // one violation per line is enough
      }
    }
  });
}

// 2. Life Map host files must not import classifier modules
for (const hostFile of LIFEMAP_HOST_FILES) {
  const filePath = path.join(ROOT, hostFile);
  if (!fs.existsSync(filePath)) continue;

  scanFile(filePath, (lineNumber, lineText) => {
    for (const fragment of CLASSIFIER_PATH_FRAGMENTS) {
      if (lineText.includes(fragment)) {
        violations.push({ file: hostFile, lineNumber, lineText });
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (violations.length > 0) {
  for (const { file, lineNumber, lineText } of violations) {
    console.error(`BOUNDARY VIOLATION: ${file}:${lineNumber}: ${lineText.trim()}`);
  }
  process.exit(1);
} else {
  const hostCount = LIFEMAP_HOST_FILES.filter((f) =>
    fs.existsSync(path.join(ROOT, f))
  ).length;
  console.log(
    `Worlds boundary check passed (scanned ${classifierFiles.length} classifier files, ${hostCount} host files).`
  );
  process.exit(0);
}
