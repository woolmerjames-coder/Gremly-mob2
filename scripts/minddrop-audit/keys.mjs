// API keys come from .audit-keys.local at the repo root (gitignored), or from
// environment variables of the same names. Never commit keys.
// Do not rename this to ".env.*": Expo's Metro env context bundles every root
// file starting with ".env" and only parses its own fixed list as env files,
// so any other ".env.*" name breaks `expo start` with a syntax error.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';
const file = join(ROOT, '.audit-keys.local');
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
  gemini: get('GEMINI_API_KEY') || get('GOOGLE_API_KEY'),
  anthropic: get('ANTHROPIC_API_KEY'),
};
