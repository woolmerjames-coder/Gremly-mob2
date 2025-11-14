/*
 * Temporary Mind Drop idempotency sanity script.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=... SUPABASE_OWNER_ID=... ts-node scripts/dev/check-drop-idempotency.ts
 *
 * The script creates a provisional catch-all note with a fixed drop_id, invokes the
 * convert_or_create_from_drop RPC, and then verifies only one active todo exists for the
 * supplied drop_id. It exits with code 1 if the invariant is broken.
 */

import { supabase } from '../../lib/supabase/client';

const DROP_ID = '11111111-2222-4333-9444-555555555555';
const OWNER_ID = process.env.SUPABASE_OWNER_ID;

async function ensureOwnerId(): Promise<string> {
  if (typeof OWNER_ID === 'string' && OWNER_ID.trim().length > 0) {
    return OWNER_ID;
  }
  throw new Error('SUPABASE_OWNER_ID env var is required for the sanity script.');
}

async function createProvisional(ownerId: string) {
  const provisional = await supabase
    .from('notes')
    .insert({
      owner_id: ownerId,
      drop_id: DROP_ID,
      title: 'Sanity drop (provisional)',
      body: 'Temporary dev sanity record',
      subtype: 'catchall',
      ai_placed: false,
      origin: 'catchall',
      labels: ['catchall', 'needs_review'],
    })
    .select('id')
    .single();

  if (provisional.error) {
    throw provisional.error;
  }

  return provisional.data?.id;
}

async function convert(ownerId: string) {
  const payload = {
    name: 'Sanity todo',
    body: 'Temporary dev sanity record',
    due_date: null,
    due_time: null,
    origin: 'catchall',
    ai_placed: true,
    tags: [],
    tags_meta: { sticky: [], tombstones: [] },
  };

  const { data, error } = await supabase.rpc('convert_or_create_from_drop', {
    p_owner: ownerId,
    p_drop_id: DROP_ID,
    p_target: 'todo',
    p_payload: payload,
  });

  if (error) {
    throw error;
  }

  return data as string | null;
}

async function verify(ownerId: string) {
  const { data, error } = await supabase
    .from('todos')
    .select('id, drop_id')
    .eq('owner_id', ownerId)
    .eq('drop_id', DROP_ID)
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  if (!data || data.length !== 1) {
    throw new Error(`Expected 1 active todo for drop ${DROP_ID}, found ${data?.length ?? 0}`);
  }

  return data[0]?.id as string;
}

async function cleanup(ownerId: string) {
  await supabase.from('todos').delete().eq('owner_id', ownerId).eq('drop_id', DROP_ID);
  await supabase.from('notes').delete().eq('owner_id', ownerId).eq('drop_id', DROP_ID);
}

async function run(): Promise<void> {
  const ownerId = await ensureOwnerId();

  await cleanup(ownerId);
  await createProvisional(ownerId);
  const todoId = await convert(ownerId);
  const verifiedTodoId = await verify(ownerId);

  if (!todoId || todoId !== verifiedTodoId) {
    throw new Error('convert_or_create_from_drop returned an unexpected todo id.');
  }

  console.log('[MindDrop][Sanity] Idempotency checks passed for drop', DROP_ID);
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('[MindDrop][Sanity] Failure during idempotency check:', error);
      process.exit(1);
    })
    .finally(async () => {
      if (typeof OWNER_ID === 'string' && OWNER_ID.trim()) {
        await cleanup(OWNER_ID);
      }
    });
}
