import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const host = '127.0.0.1';

const contentTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wgsl': 'text/plain; charset=utf-8',
};

export type Resolution =
  { kind: 'file'; path: string } | { kind: 'fallback'; path: string } | { kind: 'missing' };

export function contentTypeOf(path: string): string {
  return contentTypes[extname(path)] ?? 'application/octet-stream';
}

function pathnameOf(requestUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  } catch {
    return null;
  }
}

export function resolveRequest(root: string, requestUrl: string): Resolution {
  const pathname = pathnameOf(requestUrl);
  if (pathname === null) {
    return { kind: 'missing' };
  }
  const candidate = join(root, normalize(pathname));
  const insideRoot = candidate === root || candidate.startsWith(root + sep);
  if (insideRoot && existsSync(candidate) && statSync(candidate).isFile()) {
    return { kind: 'file', path: candidate };
  }
  if (extname(pathname) === '') {
    return { kind: 'fallback', path: join(root, 'index.html') };
  }
  return { kind: 'missing' };
}

export function createDistServer(root: string): Server {
  return createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const resolution = resolveRequest(root, request.url ?? '/');
    if (resolution.kind === 'missing' || !existsSync(resolution.path)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypeOf(resolution.path),
      'Content-Length': statSync(resolution.path).size,
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(resolution.path).pipe(response);
  });
}

function serve(): void {
  const port = Number(process.env['PORT'] ?? 4331);
  const root = resolve(process.env['DIST_DIR'] ?? 'dist/fieldline/browser');
  if (!existsSync(join(root, 'index.html'))) {
    console.error(`${root} has no index.html, run pnpm build first`);
    process.exitCode = 1;
    return;
  }
  createDistServer(root).listen(port, host, () => {
    console.log(`serving ${root} on http://${host}:${String(port)}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  serve();
}
