/**
 * Notifications: talking to Expo's push service.
 *
 * Expo answers every send with a ticket per message, inside a normal 200
 * response, so each ticket is read: an error ticket is a failed send, never a
 * success. Delivery itself is only known from the receipt, read 15 minutes later.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_PER_SEND = 100;
const MAX_PER_RECEIPTS = 1000;

/** Errors that mean this device will never receive again: switch it off. */
export const DEAD_DEVICE_ERRORS = new Set(['DeviceNotRegistered']);
/** Errors that mean every send is failing: alert straight away. */
export const ALERT_ERRORS = new Set(['InvalidCredentials', 'MismatchSenderId']);
/** Errors worth retrying later. */
export const RETRY_ERRORS = new Set(['MessageRateExceeded']);

function headers(env) {
  const h = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  // Enhanced push security: once switched on in Expo, only requests with this token are delivered
  if (env.EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  return h;
}

function chunks(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/**
 * Builds the Expo message for one device.
 * @param {object} n  { to, title, body, route, logId, moment, categoryId, interruption, threadId, data }
 */
export function buildMessage(n) {
  const msg = {
    to: n.to,
    title: n.title || undefined,
    body: n.body,
    sound: n.interruption === 'passive' ? undefined : 'default',
    categoryId: n.categoryId || undefined,
    interruptionLevel: n.interruption || 'active',
    // groups notifications of the same kind together on the lock screen
    threadId: n.threadId || n.moment,
    priority: n.interruption === 'passive' ? 'normal' : 'high',
    data: {
      route: n.route || null,
      logId: n.logId || null,
      moment: n.moment,
      ...(n.data || {}),
    },
  };
  for (const k of Object.keys(msg)) if (msg[k] === undefined) delete msg[k];
  return msg;
}

/**
 * Sends messages. Returns one result per message, in order:
 * { ok: true, ticketId } or { ok: false, error, message, retry }.
 * Throws only when Expo itself cannot be reached or rejects the whole request,
 * so the step retries.
 */
export async function sendToExpo(env, messages, fetchImpl = fetch) {
  const results = [];
  for (const batch of chunks(messages, MAX_PER_SEND)) {
    const res = await fetchImpl(SEND_URL, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify(batch),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Expo push ${res.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    if (json.errors?.length && !json.data) {
      throw new Error(
        `Expo push rejected the request: ${JSON.stringify(json.errors).slice(0, 300)}`,
      );
    }
    const tickets = json.data || [];
    batch.forEach((_, i) => {
      const t = tickets[i];
      if (t?.status === 'ok') results.push({ ok: true, ticketId: t.id });
      else {
        const error = t?.details?.error || 'NoTicket';
        results.push({
          ok: false,
          error,
          message: t?.message || 'Expo returned no ticket',
          retry: RETRY_ERRORS.has(error),
        });
      }
    });
  }
  return results;
}

/**
 * Reads receipts. Returns a map of ticket id to
 * { status: 'ok' } or { status: 'error', error, message }. Tickets Expo has not
 * settled yet are missing from the map.
 */
export async function getReceipts(env, ticketIds, fetchImpl = fetch) {
  const out = {};
  for (const ids of chunks(ticketIds, MAX_PER_RECEIPTS)) {
    const res = await fetchImpl(RECEIPTS_URL, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ ids }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Expo receipts ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text).data || {};
    for (const [id, r] of Object.entries(data)) {
      out[id] =
        r.status === 'ok'
          ? { status: 'ok' }
          : { status: 'error', error: r.details?.error || 'Unknown', message: r.message || '' };
    }
  }
  return out;
}
