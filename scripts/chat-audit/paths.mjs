import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const DATA = join(HERE, 'data') + '/';
export const RESULTS = join(HERE, 'results') + '/';
export const WORKER = join(ROOT, 'workers', 'cortex') + '/';
export const AUDIT = join(HERE, '..', 'minddrop-audit') + '/';
export const url = (p) => pathToFileURL(p).href;
