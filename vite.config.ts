/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
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
 * Compressed copies of the built game, written once beside each file
 * (name.br, name.gz) at the strongest settings, so the server sends them as
 * they are instead of compressing on the fly. Brotli at its best takes a
 * second or more per megabyte, which a live server must not spend; at build
 * time, several files at once, it is a few seconds.
 */
function precompress(): Plugin {
  const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|glb|txt|map|wasm)$/;
  const br = promisify(zlib.brotliCompress);
  const gz = promisify(zlib.gzip);
  let outDir = 'dist';
  return {
    name: 'precompress',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const files: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (COMPRESSIBLE.test(e.name)) files.push(p);
        }
      };
      await walk(outDir);
      const started = Date.now();
      let before = 0;
      let after = 0;
      await Promise.all(
        files.map(async (file) => {
          if ((await stat(file)).size < 1024) return;
          const data = await readFile(file);
          const [b, g] = await Promise.all([
            br(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
            gz(data, { level: 9 }),
          ]);
          // Only where it is worth it.
          if (b.length < data.length * 0.9) await writeFile(file + '.br', b);
          if (g.length < data.length * 0.9) await writeFile(file + '.gz', g);
          before += data.length;
          after += Math.min(b.length, data.length);
        }),
      );
      console.log(`precompressed ${files.length} files: ${(before / 1048576).toFixed(1)} MB to ${(after / 1048576).toFixed(1)} MB with brotli, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
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
    plugins: single ? [inlineEverything()] : [buildInfo(build), precompress()],
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
