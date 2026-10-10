import { defineConfig, type Plugin } from 'vite';

/**
 * Folds the built script and stylesheet into index.html, so the whole game
 * is one file that runs by double-clicking it. Used by `npm run build:single`.
 */
function inlineEverything(): Plugin {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!page || page.type !== 'asset') return;
      let html = String(page.source);
      for (const [name, file] of Object.entries(bundle)) {
        const base = esc(name.split('/').pop()!);
        if (file.type === 'chunk') {
          // A literal "</script>" inside the code would end the tag early.
          // Vite leaves a marker where it would preload chunks; there are none.
          const code = file.code.replace(/"?__VITE_PRELOAD__"?/g, 'void 0').replace(/<(\/script>|!--)/g, '\\x3C$1');
          html = html.replace(new RegExp(`<script([^>]*?) src="[^"]*?${base}"([^>]*)></script>`), (_m, a: string, b: string) => `<script${a}${b}>${code}</script>`);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          const css = String(file.source);
          html = html.replace(new RegExp(`<link[^>]*? href="[^"]*?${base}"[^>]*>`), () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      page.source = html;
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [inlineEverything()] : [],
    build: {
      target: 'es2022',
      outDir: single ? 'play' : 'dist',
      chunkSizeWarningLimit: 2000,
      ...(single
        ? {
            // One chunk, one stylesheet, fonts embedded.
            assetsInlineLimit: () => true,
            cssCodeSplit: false,
            rolldownOptions: { output: { codeSplitting: false } },
          }
        : {}),
    },
    server: { host: true, port: 5173 },
  };
});
