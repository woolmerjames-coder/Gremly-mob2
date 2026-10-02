/**
 * Notifications: telling James when something is wrong.
 *
 * Problems go to Sentry as events (its alert rule emails him), and scheduled
 * jobs check in with Sentry's cron monitoring, so a job that stops running is
 * reported too. Plain HTTP, no SDK: the DSN in SENTRY_DSN is all it needs.
 * Without a DSN the problem is still logged loudly with [ALERT].
 */

function parseDsn(dsn) {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(String(dsn || '').trim());
  if (!m) return null;
  return { key: m[1], host: m[2], project: m[3] };
}

/**
 * Reports a problem. Never throws: reporting must not break the job reporting it.
 * @param {object} p { title, level = 'error', tags = {}, extra = {} }
 */
export async function reportProblem(
  env,
  { title, level = 'error', tags = {}, extra = {} },
  fetchImpl = fetch,
) {
  console.error(`[ALERT][Notifications] ${title}`, JSON.stringify(extra).slice(0, 1500));
  const d = parseDsn(env.SENTRY_DSN);
  if (!d) return false;
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level,
    logger: 'notifications',
    environment: env.SENTRY_ENVIRONMENT || 'production',
    server_name: 'gremly-inngest-jobs',
    message: { formatted: title },
    tags: { area: 'notifications', runtime: 'cloudflare-worker', ...tags },
    extra,
  };
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: event.timestamp })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  try {
    const res = await fetchImpl(`https://${d.host}/api/${d.project}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=gremly-notifications/1.0`,
      },
      body: envelope,
    });
    return res.ok;
  } catch (err) {
    console.error(`[Notifications] Sentry report failed: ${err.message}`);
    return false;
  }
}

/**
 * A cron monitor check in. The monitor is created on first use from `schedule`
 * (crontab), so a job that stops checking in is reported by Sentry.
 * @param {string} slug  monitor slug, such as 'notifications-watchdog'
 * @param {'in_progress'|'ok'|'error'} status
 */
export async function cronCheckIn(env, slug, status, schedule, fetchImpl = fetch) {
  const d = parseDsn(env.SENTRY_DSN);
  if (!d) return false;
  try {
    const res = await fetchImpl(`https://${d.host}/api/${d.project}/cron/${slug}/${d.key}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        monitor_config: schedule
          ? {
              schedule: { type: 'crontab', value: schedule },
              checkin_margin: 20,
              max_runtime: 30,
              timezone: 'UTC',
            }
          : undefined,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[Notifications] Sentry check in failed: ${err.message}`);
    return false;
  }
}

export const _internals = { parseDsn };
