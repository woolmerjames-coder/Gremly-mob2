/**
 * Writing the brief into the day's thread (scope_chats chat_type 'daily').
 * Messages are scope_chat_messages rows; metadata_json.type says what each is
 * (lib/brief/types.ts in the app has the shapes).
 */

import { db } from '../context/db';

export async function ensureThread(env, userId, ritualDay) {
  const row = await db(env).rpc('ensure_daily_thread', { p_day: ritualDay, p_user: userId });
  const thread = Array.isArray(row) ? row[0] : row;
  if (!thread?.id) throw new Error('ensure_daily_thread returned no thread');
  return thread;
}

export async function threadMessages(env, threadId) {
  return (
    (await db(env).select(
      `scope_chat_messages?chat_id=eq.${threadId}&select=id,role,content,metadata_json,created_at&order=created_at.asc&limit=500`,
    )) || []
  );
}

/** Merge fields into the thread's metadata. */
export async function patchThreadMeta(env, thread, patch) {
  const merged = { ...(thread.metadata_json || {}), ...patch };
  const [row] = await db(env).update(`scope_chats?id=eq.${thread.id}`, {
    metadata_json: merged,
    updated_at: new Date().toISOString(),
  });
  return row || { ...thread, metadata_json: merged };
}

/**
 * Lines from an earlier run that nobody has seen are marked superseded when a
 * fresh brief is written (a later first open), so only the new lines show.
 */
export async function supersedeUnseen(env, messages) {
  const d = db(env);
  const old = messages.filter((m) => {
    const t = m.metadata_json?.type;
    return t && t.startsWith('brief-') && t !== 'brief-reply' && !m.metadata_json.superseded;
  });
  for (const m of old) {
    await d.update(`scope_chat_messages?id=eq.${m.id}`, {
      metadata_json: { ...m.metadata_json, superseded: true },
    });
  }
  return old.length;
}

/**
 * Insert the brief's messages in order. Rows written in one request would all
 * get the same created_at, so each gets its own, a few milliseconds apart.
 */
export async function appendMessages(env, userId, threadId, rows, at = Date.now()) {
  const payload = rows.map((r, i) => ({
    chat_id: threadId,
    user_id: userId,
    role: r.role,
    content: r.content || '',
    metadata_json: r.metadata_json,
    created_at: new Date(at + i * 5).toISOString(),
  }));
  if (!payload.length) return [];
  return db(env).insert('scope_chat_messages', payload);
}
