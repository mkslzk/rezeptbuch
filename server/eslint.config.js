import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'src/data/**', 'scripts/**/*.py'],
  },
  js.configs.recommended,
  {
    // ESM (package.json: type=module)
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
      // Regex-Zeichenklassen wie [•\-\*] sind bewusst escaped
      'no-useless-escape': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    // Hier laufen Snippets im Browser-Kontext (puppeteer page.evaluate),
    // deshalb sind window/document dort legitim.
    files: ['src/services/recipeImporter.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // CommonJS-Dienste
    files: ['src/**/*.cjs', 'test/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
    },
  },
];
