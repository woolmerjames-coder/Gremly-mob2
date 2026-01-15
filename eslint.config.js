const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const regexPlugin = require('eslint-plugin-regex');

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
      regex: regexPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // ═══════════════════════════════════════════════════════════════════════════════
      // DATE SAFETY RULES - Prevent timezone bugs
      // ═══════════════════════════════════════════════════════════════════════════════
      //
      // The #1 date bug: new Date().toISOString().split('T')[0]
      // At 6pm in SF (UTC-8), this returns TOMORROW's date because toISOString() converts to UTC first.
      //
      // WRONG: new Date().toISOString().split('T')[0]  // "2025-01-15" at 6pm on Jan 14 in SF
      // RIGHT: dateService.today()                      // "2025-01-14" (correct local date)
      //
      // Timezone-safe date handling: Prevent unsafe patterns on database timestamps
      'regex/invalid': [
        'warn',
        [
          {
            regex:
              '(?:created_at|completed_at|updated_at|occurred_at|swept_at|archived_at|skipped_in_sweep_at|resurface_at|last_checked_in_at).*\\.split\\([\'"]T[\'"]\\)\\[0\\]',
            message:
              "Unsafe timezone pattern: Don't use .split('T')[0] on database timestamps. Use getDateService().extractLocalDate() instead.",
          },
          {
            regex:
              '(?:created_at|completed_at|updated_at|occurred_at|swept_at|archived_at|skipped_in_sweep_at|resurface_at|last_checked_in_at).*\\.startsWith\\(today',
            message:
              "Unsafe timezone pattern: Don't use .startsWith(today) on database timestamps. Use getDateService().isTimestampToday() instead.",
          },
        ],
      ],
      // Ban dangerous toISOString().split('T')[0] pattern - this is a timezone bug!
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='className']",
          message: 'Use StyleSheet or DS primitives instead of className in React Native files.',
        },
        {
          selector:
            "CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString']",
          message:
            "TIMEZONE BUG: toISOString().split('T')[0] returns UTC date, not local date. At 6pm in SF, this returns tomorrow! Use dateService.today() or dateService.toLocalDate(date) instead.",
        },
        {
          selector:
            "CallExpression[callee.name='formatISO'] Property[key.name='representation'][value.value='date']",
          message:
            "TIMEZONE BUG: formatISO with representation:'date' may have timezone issues. Use dateService.today() or dateService.toLocalDate(date) instead.",
        },
      ],
      // Phase 7: Prevent imports from legacy/** and direct UnifiedCreateOverlay imports
      'no-restricted-imports': [
        'error',
        {
          // Disallow direct imports from the legacy folder patterns
          patterns: [
            {
              group: ['**/legacy/**', '../legacy/**', '../../legacy/**'],
              message:
                'Importing from legacy/ is deprecated. Use OverlayComponent from the gateway instead. (Allowed in tests only)',
            },
          ],
          // Disallow importing UnifiedCreateOverlay directly — enforce gateway surface
          paths: [
            {
              name: '@/components/overlay/UnifiedCreateOverlay',
              message: "Import OverlayComponent from '@/components/overlay' instead.",
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
      // Allow date patterns in tests (testing the patterns themselves)
      'regex/invalid': 'off',
    },
  },
  {
    // DateService is allowed to use toISOString() - it's the safe wrapper
    files: ['lib/date/DateService.ts', 'lib/date/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Keep className rule but disable date pattern rules for DateService
        {
          selector: "JSXAttribute[name.name='className']",
          message: 'Use StyleSheet or DS primitives instead of className in React Native files.',
        },
      ],
      'regex/invalid': 'off',
    },
  },
  {
    // Phase 7: Exemption for feature flag layer and examples using legacy overlays
    files: [
      'examples/ManualAddOverlayExample.tsx',
      'components/FeatureFlaggedOverlay.tsx',
      'hooks/useOverlayController.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Type adapters need any for flexibility
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
