// Where everything lives, relative to this folder (scripts/minddrop-audit).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const DATA = join(HERE, 'data') + '/';
export const RESULTS = join(HERE, 'results') + '/';
export const PROMPTS = join(HERE, 'prompts') + '/';
export const WORKER = join(ROOT, 'workers', 'cortex') + '/';
export const url = (p) => pathToFileURL(p).href;
