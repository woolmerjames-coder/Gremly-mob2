/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/sanity.test.(ts|tsx|js)'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/pending/'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './babel.config.js' }],
  },
};
