// Lets Node run the Cloudflare Worker source directly (node --import ./loader.mjs).
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
