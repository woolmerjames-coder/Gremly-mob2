/**
 * Tests run with the day ending at midnight unless a test sets its own day
 * end, so no test depends on the hour the suite happens to run at. The app
 * itself starts on the 3 AM default (DEFAULT_DAY_END_HOUR).
 */
beforeEach(() => {
  const { getDateService } = jest.requireActual('../../lib/date/DateService');
  getDateService().setDayBoundaryHour(0);
});
