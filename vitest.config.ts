import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vitest 5 transforms with oxc. Setting `esbuild.jsx` here is accepted and
  // then ignored — it warns and compiles JSX against the wrong runtime, which
  // fails at render with "Cannot add property __, object is not extensible".
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  test: {
    // Pure modules stay on `node`, which is faster. A component test opts into
    // a DOM per file with `// @vitest-environment happy-dom`.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
