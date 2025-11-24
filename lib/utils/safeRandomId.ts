// lib/utils/safeRandomId.ts
// Centralized ID generator that works in both Node and React Native.

export function safeRandomId(): string {
  // Try global crypto.randomUUID first (modern JS engines, some RN setups)
  const globalAny: any = globalThis as any;
  const crypto = globalAny.crypto;

  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // In Node.js test environment, try to use Node's crypto module
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeCrypto = require('crypto');
      if (nodeCrypto && typeof nodeCrypto.randomUUID === 'function') {
        return nodeCrypto.randomUUID();
      }
    } catch {
      // Ignore - will use fallback
    }
  }

  // Fallback – not cryptographically secure, but fine for list item IDs in RN.
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}
