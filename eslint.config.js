import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'spec', 'playwright-report', 'test-results', 'supabase/.temp'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Domänlagret får inte läsa klockan eller slump (03 §1).
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/planner/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Domän/planerare får inte läsa klockan – skicka nowUtc.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Domän/planerare får inte läsa klockan – skicka nowUtc.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Deterministisk planering: ingen slump.' },
        { selector: "CallExpression[callee.name='fetch']", message: 'Domänen gör ingen I/O.' },
      ],
    },
  },
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: { ...globals.node } } },
);
