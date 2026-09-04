// ESLint 10 verwendet Flat Config; .eslintrc.json bleibt als Spezifikationsreferenz erhalten.
import parser from '@typescript-eslint/parser';
import plugin from '@typescript-eslint/eslint-plugin';
export default [{
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
  plugins: { '@typescript-eslint': plugin },
  rules: {
    ...plugin.configs.recommended.rules,
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  }
}];
