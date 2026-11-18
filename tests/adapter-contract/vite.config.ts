import { defineConfig } from 'vite-plus';
export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    passWithNoTests: false,
  },
});
