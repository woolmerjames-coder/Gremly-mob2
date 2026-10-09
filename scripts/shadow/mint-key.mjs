/**
 * Prints the shadow runner's key: a token for the shadow_reader role, which
 * may only read (scripts/sql/shadow_reader_role.sql). James runs this on his
 * own machine with the project's JWT secret in the environment, and adds the
 * printed line to .audit-keys.local. The secret is never written anywhere.
 *
 *   SUPABASE_JWT_SECRET=... node scripts/shadow/mint-key.mjs [days, default 90]
 */
import { createHmac } from 'node:crypto';

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) {
  console.error('Set SUPABASE_JWT_SECRET (Supabase dashboard, Settings, API, JWT secret).');
  process.exit(1);
}
const days = Number(process.argv[2] || 90);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ role: 'shadow_reader', iss: 'supabase', iat: now, exp: now + days * 86400 });
const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
console.log(`SHADOW_SUPABASE_KEY=${head}.${body}.${sig}`);
