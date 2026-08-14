import { defineConfig } from 'vitest/config';

// Server tests run in a Node environment. The server is CommonJS; Vitest
// transpiles and requires it transparently.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
