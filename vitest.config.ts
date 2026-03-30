import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['tests/visual/**', 'node_modules/**'],
    testTimeout: 10000,
    hookTimeout: 15000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/ui/**/*.{ts,tsx}'],
      exclude: ['src/ui/**/*.test.{ts,tsx}', 'src/ui/styles/**'],
      reporter: ['text', 'text-summary'],
    },
  },
});
