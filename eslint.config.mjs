import parser from '@typescript-eslint/parser';
export default [
 {ignores:['**/node_modules/**','**/dist/**','**/src/generated/**','**/.terraform/**','test-results/**','playwright-report/**']},
 {files:['apps/**/*.{ts,tsx}','scripts/**/*.{ts,mjs}','packages/**/*.cjs','tests/**/*.{ts,cjs,mjs}'],languageOptions:{parser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},rules:{'no-dupe-args':'error','no-dupe-class-members':'error','no-dupe-else-if':'error','no-dupe-keys':'error','no-duplicate-case':'error','no-fallthrough':'error','no-self-assign':'error','no-unreachable':'error','no-unsafe-finally':'error','valid-typeof':'error'}}
];
