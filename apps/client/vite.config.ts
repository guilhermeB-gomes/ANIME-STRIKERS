import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const target = process.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify('0.1.0') },
  server: {
    port: 5173,
    proxy: { '/api': target, '/socket.io': { target, ws: true } },
  },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
