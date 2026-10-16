// The built game as static files, revalidated by ETag. Hashed asset files
// are cached for good; everything else is checked each time.
//
// Compression: the build writes a .br and a .gz beside each file (see
// precompress in vite.config.ts), and those are sent as they are. A file
// without one (a build made some other way) is compressed in the background
// at a quick setting and kept; large ones are sent as they are rather than
// keep anyone waiting. Nothing here ever holds the server up: a room's race
// runs on the same thread.

import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Compressed on the fly only below this; larger files without a .br or .gz go as they are. */
const LIVE_LIMIT = 512 * 1024;
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export function staticFiles(root: string) {
  const packed = new Map<string, Buffer>();
  /** Files being compressed now, so two requests for one file wait on one job. */
  const working = new Map<string, Promise<Buffer>>();
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url || '/', 'http://x');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.stat(file, (serr, stat) => {
      if (serr || !stat.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found. Run "npm run build" first.');
        return;
      }
      const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const hashed = /[/\\]assets[/\\]/.test(file);
      const head: Record<string, string | number> = {
        'content-type': type,
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        etag,
        'x-content-type-options': 'nosniff',
        vary: 'accept-encoding',
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, head);
        res.end();
        return;
      }
      const accept = String(req.headers['accept-encoding'] || '');
      const squeezable = /text|javascript|json|svg|gltf|wasm/.test(type);
      const wants: Array<'br' | 'gzip'> = squeezable ? [...(/\bbr\b/.test(accept) ? (['br'] as const) : []), ...(/\bgzip\b/.test(accept) ? (['gzip'] as const) : [])] : [];
      const send = (body: Buffer, enc: string) => {
        if (enc) head['content-encoding'] = enc;
        head['content-length'] = body.length;
        res.writeHead(200, head);
        res.end(req.method === 'HEAD' ? undefined : body);
      };
      const fail = () => {
        if (res.headersSent) return;
        res.writeHead(500);
        res.end();
      };
      // 1. The build's own compressed copy.
      const precompressed = (i: number): void => {
        if (i >= wants.length) return live();
        const enc = wants[i];
        const alt = file + (enc === 'br' ? '.br' : '.gz');
        const key = alt + etag;
        const hit = packed.get(key);
        if (hit) return send(hit, enc);
        fs.stat(alt, (aerr, astat) => {
          // Only a copy made from this version of the file.
          if (aerr || !astat.isFile() || astat.mtimeMs + 1 < stat.mtimeMs) return precompressed(i + 1);
          fs.readFile(alt, (rerr, body) => {
            if (rerr) return precompressed(i + 1);
            remember(key, body);
            send(body, enc);
          });
        });
      };
      // 2. Compressed here, in the background, for a small file; else as it is.
      const live = (): void => {
        fs.readFile(file, (err, data) => {
          if (err) return fail();
          const enc = wants[0];
          if (!enc || data.length > LIVE_LIMIT) return send(data, '');
          const key = file + etag + enc;
          const hit = packed.get(key);
          if (hit) return send(hit, enc);
          let job = working.get(key);
          if (!job) {
            job = enc === 'br' ? brotli(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : gzip(data, { level: 6 });
            working.set(key, job);
            job.then((body) => remember(key, body)).finally(() => working.delete(key)).catch(() => {});
          }
          job.then((body) => send(body, enc), () => send(data, ''));
        });
      };
      const remember = (key: string, body: Buffer): void => {
        if (packed.size > 256) packed.clear();
        packed.set(key, body);
      };
      precompressed(0);
    });
  };
}
