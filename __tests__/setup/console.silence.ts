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

// Silence console methods during tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

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
