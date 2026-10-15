/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * The build's name: the package version and the commit, plus the time for an
 * uncommitted tree. A room only takes players on the build that made it, and
 * the server reads dist/build.json to know which build it serves.
 */
function buildName(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let commit = 'local';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (dirty) commit += '-' + Date.now().toString(36);
  } catch {
    commit += '-' + Date.now().toString(36);
  }
  return `${pkg.version}+${commit}`;
}

/** Writes build.json beside the game for the server. */
function buildInfo(build: string): Plugin {
  return {
    name: 'build-info',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ build }) + '\n' });
    },
  };
}

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

export default defineConfig(({ mode, command }) => {
  const single = mode === 'single';
  const build = command === 'build' ? buildName() : 'dev';
  return {
    base: './',
    define: { __BUILD__: JSON.stringify(build) },
    plugins: single ? [inlineEverything()] : [buildInfo(build)],
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
    // Several tests run whole races; on a slower machine, with every file in
    // parallel, the 5-second default is not enough.
    test: { testTimeout: 30_000 },
  };
});
