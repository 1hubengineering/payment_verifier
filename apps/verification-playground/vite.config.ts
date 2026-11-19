import { defineConfig } from 'vite-plus';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4081,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4080' },
  },
});
