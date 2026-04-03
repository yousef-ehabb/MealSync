import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
  },
  server: {
    port: 5888,
    strictPort: false,
    host: '127.0.0.1',
  },
});
