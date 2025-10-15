# GitHub Issue: Unskip RN rendering tests — stabilize Jest + RN runtime

**Title:** Unskip RN rendering tests — stabilize Jest + RN runtime

## Problem Description

Two React Native component tests (`Button.test.tsx` and `Tabs.test.tsx`) have been temporarily skipped due to Jest runtime failures when importing React Native modules. The tests fail with:

```
SyntaxError: Cannot use import statement outside a module
```

This occurs when Jest tries to import React Native modules that use ESM syntax, which are not being properly transformed by Babel in the test environment.

## Affected Tests

- `__tests__/Button.skip.test.tsx`
- `__tests__/Tabs.skip.test.tsx`

Both tests are currently excluded via the `testPathIgnorePatterns` configuration in `jest.config.js`.

## Steps to Reproduce

1. Rename `__tests__/Button.skip.test.tsx` to `__tests__/Button.test.tsx`
2. Rename `__tests__/Tabs.skip.test.tsx` to `__tests__/Tabs.test.tsx`
3. Remove the skip pattern from `jest.config.js`: `'.*\\.skip\\.test\\.(ts|tsx|js)$'`
4. Run `npm test`

**Expected:** Tests should pass  
**Actual:** Tests fail with import statement syntax error

## Root Cause

The issue stems from:
1. React Native and NativeWind using ESM imports that aren't transformed in the Node test environment
2. Missing `transformIgnorePatterns` configuration to transform node_modules
3. Potentially missing React Native test preset configuration

## Proposed Solution

### 1. Update `jest.config.js` with proper React Native support

```javascript
module.exports = {
  preset: 'jest-expo', // Use Expo's Jest preset
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.(test|spec).(ts|tsx|js)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/__tests__/pending/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|nativewind)/)',
  ],
  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy', // Mock CSS imports
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
```

### 2. Create `jest.setup.js` to mock native modules

```javascript
// Mock React Native modules that don't work in Node
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Mock NativeWind's styled function if needed
jest.mock('nativewind', () => ({
  styled: (Component) => Component,
}));
```

### 3. Use `@testing-library/react-native` for component testing

Install if not present:
```bash
npm install --save-dev @testing-library/react-native
```

Update test files to use proper React Native rendering:

```tsx
import { render } from '@testing-library/react-native';
import { Button } from '../design-system/Button';

describe('Button', () => {
  test('renders button component', () => {
    const { getByText } = render(
      <Button onPress={() => {}}>Click me</Button>
    );
    expect(getByText('Click me')).toBeTruthy();
  });
});
```

### 4. Update `babel.config.js` if needed

Ensure the babel config supports Jest:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      'react-native-reanimated/plugin', // must be last
    ],
    env: {
      test: {
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    },
  };
};
```

## Acceptance Criteria

- [ ] Rename `Button.skip.test.tsx` → `Button.test.tsx`
- [ ] Rename `Tabs.skip.test.tsx` → `Tabs.test.tsx`
- [ ] Remove skip pattern from `jest.config.js`
- [ ] Configure Jest to properly transform React Native modules
- [ ] All tests pass with `npm test`
- [ ] All tests pass with `npm run ci`
- [ ] No import/syntax errors in test output

## Additional Context

- Project uses Expo SDK 54, React Native 0.81.4, NativeWind v2
- Tests currently use `@jest-environment node` which doesn't support RN rendering
- Phase 3 data layer tests (schemas, repo, heuristic engine) all pass correctly
- This is a test infrastructure issue, not a component implementation issue

## Priority

**Medium** - Tests are functional and skip correctly, but should be unskipped for full test coverage and CI confidence.

---

**Issue created on:** October 15, 2025  
**Branch:** feat/models-cortex-interfaces  
**Related files:** `__tests__/Button.skip.test.tsx`, `__tests__/Tabs.skip.test.tsx`, `jest.config.js`
