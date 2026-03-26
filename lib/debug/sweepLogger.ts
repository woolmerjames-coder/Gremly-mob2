const isDev = __DEV__;

export const sweepLog = {
  debug: (...args: any[]) => {
    if (isDev) console.log('[Sweep]', ...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn('[Sweep]', ...args);
  },
  error: (...args: any[]) => {
    // Always log errors
    console.error('[Sweep]', ...args);
  },
};
