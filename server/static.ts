// The built game as static files: compressed once and kept, revalidated by
// ETag. Hashed asset files are cached for good; everything else is checked
// each time.

import fs from 'node:fs';
import path from 'node:path';
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

export function staticFiles(root: string) {
  const packed = new Map<string, Buffer>();
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
      const squeezable = /text|javascript|json|svg|gltf/.test(type);
      const enc = squeezable ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : '') : '';
      const key = file + etag + enc;
      const send = (body: Buffer) => {
        if (enc) head['content-encoding'] = enc;
        head['content-length'] = body.length;
        res.writeHead(200, head);
        res.end(req.method === 'HEAD' ? undefined : body);
      };
      const hit = packed.get(key);
      if (hit) return send(hit);
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end();
          return;
        }
        const body = enc === 'br' ? zlib.brotliCompressSync(data) : enc === 'gzip' ? zlib.gzipSync(data, { level: 9 }) : data;
        if (packed.size > 128) packed.clear();
        packed.set(key, body);
        send(body);
      });
    });
  };
}
