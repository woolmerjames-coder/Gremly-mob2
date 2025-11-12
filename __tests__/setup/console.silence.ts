/**
 * Console silence for tests
 *
 * Mutes console.log, console.warn, and console.error during tests
 * to reduce noise. Critical errors will still fail tests.
 *
 * To see console output during development, comment out the global
 * assignments or run tests with --verbose flag.
 */

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

// Store original methods for potential restore
(global as Record<string, unknown>).originalConsole = originalConsole;

const shouldSilence = process.env.DEBUG_TEST_LOGS !== '1';

if (shouldSilence) {
  // Silence console methods during tests unless debugging is requested
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Export restore function for tests that need console output
export function restoreConsole() {
  global.console = {
    ...console,
    log: originalConsole.log,
    warn: originalConsole.warn,
    error: originalConsole.error,
    info: originalConsole.info,
    debug: originalConsole.debug,
  };
}

// Export silence function for tests that want to re-silence
export function silenceConsole() {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Global cleanup after each test
// NOTE: testing-library/react-native automatically registers its own afterEach
// for cleanup. We register this BEFORE importing any test files to ensure
// our timer cleanup runs before testing-library's cleanup.
afterEach(() => {
  // CRITICAL: Clear timers to prevent testing-library cleanup timeout
  jest.clearAllTimers();
  jest.useRealTimers();

  // Memory management: clear all module caches
  jest.clearAllMocks();

  // Force garbage collection if available (CI environments)
  if (global.gc) {
    global.gc();
  }
});
