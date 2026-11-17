import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.srt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

export async function startStaticServer({
  rootDir = DEFAULT_ROOT,
  host = '127.0.0.1',
  port = 0,
} = {}) {
  const resolvedRoot = path.resolve(rootDir);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const parsed = new URL(req.url || '/', `http://${host}`);
      let reqPath = decodeURIComponent(parsed.pathname);
      if (reqPath === '/') reqPath = '/index.html';

      const targetPath = path.resolve(resolvedRoot, `.${reqPath}`);
      if (targetPath !== resolvedRoot && !targetPath.startsWith(resolvedRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      let stat;
      try {
        stat = await fs.stat(targetPath);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not Found: ${reqPath}`);
        return;
      }

      const filePath = stat.isDirectory() ? path.join(targetPath, 'index.html') : targetPath;
      const fileStat = stat.isDirectory() ? await fs.stat(filePath) : stat;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const totalSize = fileStat.size;
      const range = req.headers.range;

      if (range && req.method === 'GET') {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (m) {
          const start = m[1] ? Number(m[1]) : 0;
          const end = m[2] ? Math.min(Number(m[2]), totalSize - 1) : totalSize - 1;
          if (start >= 0 && start <= end && end < totalSize) {
            const fh = await fs.open(filePath, 'r');
            try {
              const len = end - start + 1;
              const buf = Buffer.allocUnsafe(len);
              await fh.read(buf, 0, len, start);
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(len),
                'Content-Type': contentType,
                'Cache-Control': 'no-store',
              });
              res.end(buf);
            } finally {
              await fh.close();
            }
            return;
          }
        }
      }

      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': String(data.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(data);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Internal Server Error: ${err.message}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${host}:${actualPort}`;

  return {
    server,
    port: actualPort,
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const cliPort = Number(process.env.PORT || process.argv[2] || 4175);
  const handle = await startStaticServer({ port: cliPort });
  console.log(`Static server listening at ${handle.url} (preview: ${handle.url}/?preview=1, player: ${handle.url}/watch.html)`);
}
