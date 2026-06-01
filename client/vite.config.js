import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/recipe/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    allowedHosts: [
      'openclaw.tail62577c.ts.net',
      'openclaw.mara-palermo.ts.net',
      'tail62577c.ts.net',
      'mara-palermo.ts.net',
      '100.65.153.96',
      '100.126.245.125',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
