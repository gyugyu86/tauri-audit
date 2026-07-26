import tsPlugin from '@typescript-eslint/eslint-plugin';

// typescript is pinned to ^6.0.3 (not the 7.x line) because typescript-eslint@8.64.0
// — the latest release, with no v9 tag — declares peer `typescript: >=4.8.4 <6.1.0`,
// and no dist-tag widens it. Revisit when typescript-eslint ships TS 7 support.

export default [
  // tests/fixtures/** and each vendored app under tests/corpus/<name>/ are target
  // sample projects — some deliberately vulnerable, none of them our code. Never
  // lint them. The *.ts files sitting directly in tests/corpus/ (the corpus tests
  // themselves) ARE our code and stay linted, hence `corpus/*/**` not `corpus/**`.
  {
    ignores: ['dist/**', 'node_modules/**', 'tests/fixtures/**', 'tests/corpus/*/**'],
  },
  ...tsPlugin.configs['flat/strict'],
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
