import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/providers/index.ts', 'src/storage.ts'],
    format: ['esm'],
    dts: { generator: 'oxc' },
    target: 'node24.22.3',
    sourcemap: true,
    clean: true,
  },
});
