import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every module under test is pure logic. Nothing here needs a DOM;
    // code that does touch the DOM stays out of the test suite by design.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
