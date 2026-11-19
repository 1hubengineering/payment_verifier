import { defineConfig } from 'vite-plus';
export default defineConfig({
  pack: {
    entry: ['src/postgres.ts', 'src/mysql.ts', 'src/sqlite.ts'],
    format: ['esm'],
    dts: { generator: 'oxc' },
    target: 'node24.22.3',
    sourcemap: true,
    clean: true,
  },
});
