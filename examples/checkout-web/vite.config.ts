import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';
import { documentation } from './docs-render.mjs';

export default defineConfig({
  base: './',
  envDir: false,
  plugins: [documentation()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    license: { fileName: 'dependency-licenses.md' },
    rolldownOptions: {
      input: [
        fileURLToPath(new URL('./index.html', import.meta.url)),
        fileURLToPath(new URL('./demo/index.html', import.meta.url)),
        fileURLToPath(new URL('./docs/index.html', import.meta.url)),
        fileURLToPath(new URL('./api/index.html', import.meta.url)),
        fileURLToPath(new URL('./playground/index.html', import.meta.url)),
        fileURLToPath(new URL('./benchmarks/index.html', import.meta.url)),
        fileURLToPath(new URL('./candidate/index.html', import.meta.url)),
      ],
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
