import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` produces one self-contained HTML file
// (play/index.html) that runs by double-clicking it, no server needed.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'play' : 'dist',
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true, port: 5173 },
}));
