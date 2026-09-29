// Keys come from .env.audit.local at the repo root (gitignored) or env vars of
// the same names. GEMINI_TEST_API_KEY is a separate Google Cloud project from
// the app, so this test never shares the app's daily quota.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';
const file = join(ROOT, '.env.audit.local');
const fromFile = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) fromFile[m[1]] = m[2];
  }
}
const get = (k) => process.env[k] || fromFile[k] || '';
export const keys = {
  openai: get('OPENAI_API_KEY'),
  gemini: get('GEMINI_TEST_API_KEY') || get('GEMINI_API_KEY') || get('GOOGLE_API_KEY'),
  anthropic: get('ANTHROPIC_API_KEY'),
};
export const geminiKeyIsTestProject = !!get('GEMINI_TEST_API_KEY');
