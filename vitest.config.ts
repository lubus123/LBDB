import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['tests/visual/**', 'tests/e2e/**', 'node_modules/**'],
    testTimeout: 10000,
    hookTimeout: 15000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: [
        'src/engine/**/*.ts',
        'src/server/**/*.ts',
        'src/shared/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/test/**',
        '**/*.tsx',
      ],
      reporter: ['text', 'text-summary'],
    },
  },
});
