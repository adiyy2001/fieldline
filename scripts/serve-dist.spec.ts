import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentTypeOf, createDistServer, host, resolveRequest } from './serve-dist.ts';

let root = '';
let origin = '';
let server: ReturnType<typeof createDistServer>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'fieldline-serve-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<p>index</p>');
  writeFileSync(join(root, 'assets', 'main.js'), 'export {};');
  writeFileSync(join(root, 'favicon.svg'), '<svg></svg>');
  server = createDistServer(root);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the test server has no port');
  }
  origin = `http://${host}:${String(address.port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  rmSync(root, { recursive: true, force: true });
});

describe('resolveRequest', () => {
  it('serves an existing file', () => {
    expect(resolveRequest(root, '/assets/main.js')).toEqual({
      kind: 'file',
      path: join(root, 'assets', 'main.js'),
    });
  });

  it('ignores the query string', () => {
    expect(resolveRequest(root, '/favicon.svg?automation')).toMatchObject({ kind: 'file' });
  });

  it('falls back to the index for the root and for paths without an extension', () => {
    const index = join(root, 'index.html');
    expect(resolveRequest(root, '/')).toEqual({ kind: 'fallback', path: index });
    expect(resolveRequest(root, '/some/deep/link')).toEqual({ kind: 'fallback', path: index });
  });

  it('reports a missing file with an extension instead of masking it with the index', () => {
    expect(resolveRequest(root, '/assets/missing.js')).toEqual({ kind: 'missing' });
  });

  it('treats an unreadable request target as missing', () => {
    expect(resolveRequest(root, '//')).toEqual({ kind: 'missing' });
    expect(resolveRequest(root, '/%E0%A4%A')).toEqual({ kind: 'missing' });
  });

  it('does not leave the served folder', () => {
    expect(resolveRequest(root, '/../package.json')).not.toMatchObject({ kind: 'file' });
    expect(resolveRequest(root, '/%2e%2e/%2e%2e/etc/passwd')).not.toMatchObject({ kind: 'file' });
    expect(resolveRequest(root, '/..%2f..%2fetc/passwd')).not.toMatchObject({ kind: 'file' });
  });
});

describe('contentTypeOf', () => {
  it('maps the build output types and defaults to binary', () => {
    expect(contentTypeOf('index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeOf('main-ABC.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeOf('styles.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeOf('favicon.svg')).toBe('image/svg+xml');
    expect(contentTypeOf('data.bin')).toBe('application/octet-stream');
  });
});

describe('createDistServer', () => {
  it('answers a request for a file, the index and a deep link', async () => {
    const script = await fetch(`${origin}/assets/main.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await script.text()).toBe('export {};');
    expect(await (await fetch(`${origin}/`)).text()).toBe('<p>index</p>');
    expect(await (await fetch(`${origin}/deep/link?x=1`)).text()).toBe('<p>index</p>');
  });

  it('answers 404 for a missing asset', async () => {
    expect((await fetch(`${origin}/assets/missing.js`)).status).toBe(404);
  });

  it('answers a HEAD request without a body', async () => {
    const response = await fetch(`${origin}/`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('12');
    expect(await response.text()).toBe('');
  });

  it('rejects methods other than GET and HEAD', async () => {
    const response = await fetch(`${origin}/`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
