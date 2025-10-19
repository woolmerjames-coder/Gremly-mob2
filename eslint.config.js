const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'dist/**',
      '*.config.js',
      'babel.config.js',
      '_archive/**',
      'app/(dev)/**',
      '**/*.legacy.tsx',
      'legacy/**', // Exclude legacy from linting unless explicitly configured
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
        React: 'readonly',
        JSX: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Phase F: Prevent className usage in JSX (use StyleSheet or DS primitives)
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className']",
          message: 'Use StyleSheet or DS primitives instead of className in React Native files.',
        },
      ],
      // Phase 7: Prevent imports from legacy/** except in tests
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/legacy/**', '../legacy/**', '../../legacy/**'],
              message:
                'Importing from legacy/ is deprecated. Use UnifiedCreateOverlay instead. (Allowed in tests only)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Allow legacy imports in tests
      'no-restricted-imports': 'off',
    },
  },
  {
    // Phase 7: Temporary exemption for example files still using legacy overlays
    files: ['examples/ManualAddOverlayExample.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Phase F: Legacy files still using className (deprecated, won't work without NativeWind)
    // These are kept for reference but should not be actively used (FLAGS.USE_DS_UI = true)
    // NOTE: Most legacy files are now ignored via top-level ignores (app/(dev)/**, **/*.legacy.tsx, _archive/**)
    files: [
      'app/screens/SpaceDetailScreen.tsx', // TODO: Migrate to DS or rename to .legacy.tsx
    ],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];
