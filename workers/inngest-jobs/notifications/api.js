/**
 * Notifications: the worker's API routes (the admin key is checked upstream;
 * the cortex worker forwards the app's signed in requests with it).
 *
 * POST /api/notifications/test { user_id, moment, words? }
 *   The Lab's "send now", for tester accounts only: a real send through the
 *   real sender to their own phones, marked as a test.
 */

import { db } from '../context/db';
import { MOMENTS } from './policy';
import { sendEvents } from './planner';

const TEST_EVENT = 'notifications/test.send';

export async function handleNotificationsApi(request, env, corsResponse) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/notifications/test' || request.method !== 'POST') {
    return corsResponse({ error: 'not found' }, 404);
  }
  const body = await request.json().catch(() => ({}));
  const userId = body.user_id;
  if (!userId) return corsResponse({ error: 'user_id is required' }, 400);
  const moment = body.moment || 'brief';
  if (!MOMENTS[moment] && moment !== 'canary')
    return corsResponse({ error: `unknown moment ${moment}` }, 400);

  const [cp] =
    (await db(env).select(`cortex_preferences?owner_id=eq.${userId}&select=is_tester`)) || [];
  if (!cp?.is_tester) return corsResponse({ error: 'testers only' }, 403);

  const words =
    body.words && typeof body.words.body === 'string'
      ? { title: String(body.words.title || '').slice(0, 60), body: body.words.body.slice(0, 200) }
      : null;
  const key = `test:${userId}:${Date.now()}`;
  await sendEvents(env, [
    {
      name: TEST_EVENT,
      id: key,
      data: { user_id: userId, moment, dedupe_key: key, data: words ? { words } : {} },
    },
  ]);
  return corsResponse({ ok: true, dedupe_key: key });
}
