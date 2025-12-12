/**
 * TestLogger - Structured single-line logging for test scenarios
 *
 * Prints one-line logs prefixed with [TEST] using console.log.
 * No environment gating - if a case is active, it logs.
 * All output is single-line JSON.
 */

type LogMeta = Record<string, unknown>;

/**
 * Safely serialize an object to JSON, handling circular references
 * Guarantees single-line output
 */
const safeStringify = (obj: unknown): string => {
  try {
    return JSON.stringify(obj);
  } catch {
    // Fallback: shallow copy for circular reference handling
    if (obj && typeof obj === 'object') {
      const shallow: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        try {
          const val = (obj as Record<string, unknown>)[key];
          shallow[key] = typeof val === 'object' ? '[object]' : val;
        } catch {
          shallow[key] = '[error]';
        }
      }
      try {
        return JSON.stringify(shallow);
      } catch {
        return JSON.stringify({ error: 'serialization_failed' });
      }
    }
    return JSON.stringify({ error: 'serialization_failed' });
  }
};

class TestLogger {
  private currentCase: string | null = null;

  /**
   * Check if a test case is currently active
   */
  isActive(): boolean {
    return this.currentCase !== null;
  }

  /**
   * Get the current test case name
   */
  getCurrentCase(): string | null {
    return this.currentCase;
  }

  /**
   * Start a new test case
   */
  start(caseName: string, meta?: LogMeta): void {
    this.currentCase = caseName;
    const payload = {
      case: caseName,
      event: 'TEST_CASE_START',
      ...meta,
      ts: new Date().toISOString(),
    };
    console.log(`[TEST] ${safeStringify(payload)}`);
  }

  /**
   * Log a test step within the current case
   * No-op if no case is active
   */
  step(step: string, meta?: LogMeta): void {
    if (!this.currentCase) return;

    const payload = {
      case: this.currentCase,
      event: 'TEST_STEP',
      step,
      ...meta,
      ts: new Date().toISOString(),
    };
    console.log(`[TEST] ${safeStringify(payload)}`);
  }

  /**
   * Log an assertion result
   * No-op if no case is active
   */
  assert(name: string, ok: boolean, meta?: LogMeta): void {
    if (!this.currentCase) return;

    const payload = {
      case: this.currentCase,
      event: 'TEST_ASSERT',
      assert: name,
      ok,
      ...meta,
      ts: new Date().toISOString(),
    };
    console.log(`[TEST] ${safeStringify(payload)}`);
  }

  /**
   * Log surface membership check (entity presence in a UI surface)
   * No-op if no case is active
   */
  surface(surface: string, entityId: string, present: boolean, meta?: LogMeta): void {
    if (!this.currentCase) return;

    const payload = {
      case: this.currentCase,
      event: 'SURFACE_MEMBERSHIP',
      surface,
      entityId,
      present,
      ...meta,
      ts: new Date().toISOString(),
    };
    console.log(`[TEST] ${safeStringify(payload)}`);
  }

  /**
   * End the current test case
   * No-op if no case is active
   */
  end(ok: boolean, meta?: LogMeta): void {
    if (!this.currentCase) return;

    const payload = {
      case: this.currentCase,
      event: 'TEST_CASE_END',
      ok,
      ...meta,
      ts: new Date().toISOString(),
    };
    console.log(`[TEST] ${safeStringify(payload)}`);
    this.currentCase = null;
  }
}

// Singleton instance
export const testLogger = new TestLogger();

// Export class for custom instances if needed
export { TestLogger };
export type { LogMeta };
