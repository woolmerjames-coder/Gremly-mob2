/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/pending/'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(nativewind|react-native|@react-native|react-native-.*|@react-navigation/.*)/)',
  ],
  setupFiles: ['<rootDir>/jest-setup.ts', 'react-native-gesture-handler/jestSetup'],
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '<rootDir>/__tests__/setup/console.silence.ts',
  ],
  moduleNameMapper: {
    '\\.(png|jpg|jpeg|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    '^.+\\.(css|scss)$': 'identity-obj-proxy',
  },
  globals: {
    __DEV__: true,
  },
  reporters: ['default'],
};
