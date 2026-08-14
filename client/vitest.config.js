import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Client component tests run in jsdom (a simulated browser DOM).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
});
