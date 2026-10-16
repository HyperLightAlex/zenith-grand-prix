// Builds the server (server/index.ts and the simulation it shares with the
// game) into dist-server/, so `npm start` runs plain Node.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    target: 'node20',
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'index.mjs' } },
  },
});
