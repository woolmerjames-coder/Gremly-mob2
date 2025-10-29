/// <reference types="nativewind/types" />

declare module 'nativewind';

// Type-only shim for module alias used in app code; runtime resolution handled by Babel module-resolver
declare module '@/src/config/featureFlags' {
  export const MIND_DROP_V2: boolean;
  export const flags: { MIND_DROP_V2: boolean };
  export const whenEnabled: <T>(flag: boolean, on: () => T, off: () => T) => T;
}

// Jest tests import react-test-renderer for act; provide a minimal module shim for TS
declare module 'react-test-renderer';

declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const content: ImageSourcePropType;
  export default content;
}
