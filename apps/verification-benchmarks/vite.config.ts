import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      main: 'src/main.ts',
      performance: 'src/performance.ts',
      presets: 'src/presets.ts',
      suite: 'src/suite.ts',
      synthetic: 'src/synthetic.ts',
    },
    format: ['esm'],
    target: 'node24.22.3',
    clean: true,
  },
});
