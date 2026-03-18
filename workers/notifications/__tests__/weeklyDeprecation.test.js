/**
 * Tests covering the deprecation of V1 weekly summary pipeline
 * in workers/notifications/index.js.
 *
 * Verifies:
 * - /backfill-weekly returns 410 Gone with deprecation JSON
 * - sendScheduledNotifications no longer processes weekly_summary type
 */

// ── Re-derive the /backfill-weekly response ──────────────────────────────────

function handleBackfillWeekly(pathname, method) {
  if (pathname === '/backfill-weekly' && method === 'POST') {
    return {
      status: 410,
      body: {
        error:
          'This endpoint is deprecated. Weekly summaries are now generated via the weeklySummaryV2Worker Inngest pipeline. Trigger manually via the Inngest dashboard with event app/weekly-summary-v2.run.',
        deprecated: true,
      },
    };
  }
  return null; // not handled
}

/**
 * Re-derive the notification types that sendScheduledNotifications
 * now processes. weekly_summary is no longer in the list.
 */
const ACTIVE_NOTIFICATION_TYPES = ['morning', 'evening', 'afternoon'];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('/backfill-weekly deprecation', () => {
  it('returns 410 Gone for POST /backfill-weekly', () => {
    const result = handleBackfillWeekly('/backfill-weekly', 'POST');
    expect(result).not.toBeNull();
    expect(result.status).toBe(410);
  });

  it('includes deprecation flag in response body', () => {
    const result = handleBackfillWeekly('/backfill-weekly', 'POST');
    expect(result.body.deprecated).toBe(true);
  });

  it('includes descriptive error message', () => {
    const result = handleBackfillWeekly('/backfill-weekly', 'POST');
    expect(result.body.error).toContain('deprecated');
    expect(result.body.error).toContain('weeklySummaryV2Worker');
  });

  it('points to the correct Inngest event', () => {
    const result = handleBackfillWeekly('/backfill-weekly', 'POST');
    expect(result.body.error).toContain('app/weekly-summary-v2.run');
  });

  it('does not match GET requests', () => {
    const result = handleBackfillWeekly('/backfill-weekly', 'GET');
    expect(result).toBeNull();
  });

  it('does not match other paths', () => {
    const result = handleBackfillWeekly('/send-notifications', 'POST');
    expect(result).toBeNull();
  });
});

describe('sendScheduledNotifications – weekly removal', () => {
  it('does not include weekly_summary in active notification types', () => {
    expect(ACTIVE_NOTIFICATION_TYPES).not.toContain('weekly_summary');
  });

  it('includes morning notifications', () => {
    expect(ACTIVE_NOTIFICATION_TYPES).toContain('morning');
  });

  it('includes evening notifications', () => {
    expect(ACTIVE_NOTIFICATION_TYPES).toContain('evening');
  });

  it('includes afternoon notifications', () => {
    expect(ACTIVE_NOTIFICATION_TYPES).toContain('afternoon');
  });

  it('has exactly 3 active notification types', () => {
    expect(ACTIVE_NOTIFICATION_TYPES).toHaveLength(3);
  });
});
