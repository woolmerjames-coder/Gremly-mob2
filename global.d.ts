/// <reference types="nativewind/types" />

declare module 'nativewind';

// Type-only shim for module alias used in app code; runtime resolution handled by Babel module-resolver
declare module '@/src/config/featureFlags' {
  export const MIND_DROP_V2: boolean;
  export const flags: { MIND_DROP_V2: boolean };
  export const whenEnabled: <T>(flag: boolean, on: () => T, off: () => T) => T;
}
