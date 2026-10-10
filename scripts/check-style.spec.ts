import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectFiles,
  findCommentViolations,
  findDashViolations,
  findDeviceCallViolations,
  findStaleExclusions,
  runCheck,
} from './check-style.ts';

const emDash = String.fromCharCode(0x2014);
const enDash = String.fromCharCode(0x2013);
const minusSign = String.fromCharCode(0x2212);

function lines(fileName: string, text: string): number[] {
  return findCommentViolations(fileName, text).map((violation) => violation.line);
}

describe('comments in TypeScript', () => {
  it('accepts a clean file', () => {
    expect(lines('a.ts', 'export const answer = 42;\n')).toEqual([]);
  });

  it('finds line, block, doc and trailing comments with their line numbers', () => {
    const text = [
      'const first = 1; // trailing',
      '/* block */',
      '/** doc */',
      'export function second() {',
      '  return first; // another',
      '}',
    ].join('\n');
    expect(lines('a.ts', text)).toEqual([1, 2, 3, 5]);
  });

  it('finds a comment at the end of the file', () => {
    expect(lines('a.ts', 'export const a = 1;\n// last\n')).toEqual([2]);
  });

  it('ignores comment markers inside strings, templates and regular expressions', () => {
    const text = [
      'export const url = "http://example.com";',
      'export const template = `a // b ${1} /* c */`;',
      'export const pattern = /\\/\\/ not a comment/;',
    ].join('\n');
    expect(lines('a.ts', text)).toEqual([]);
  });

  it('checks plain JavaScript files too', () => {
    expect(lines('eslint.config.js', 'export default [];\n// note\n')).toEqual([2]);
    expect(lines('config.mjs', '/* note */\nexport default [];\n')).toEqual([1]);
  });

  it('allows a shebang line', () => {
    expect(lines('run.ts', '#!/usr/bin/env node\nexport {};\n')).toEqual([]);
  });
});

describe('comments in WGSL, HTML and CSS', () => {
  it('finds line and block comments in WGSL', () => {
    expect(lines('a.wgsl', 'fn f() {} // note\n/* x */\nfn g() {}\n')).toEqual([1, 2]);
  });

  it('counts a nested WGSL block comment once', () => {
    expect(lines('a.wgsl', '/* outer /* inner */ still outer */\nfn f() {}\n')).toEqual([1]);
  });

  it('accepts clean WGSL', () => {
    expect(lines('a.wgsl', '@compute @workgroup_size(64)\nfn main() {}\n')).toEqual([]);
  });

  it('finds HTML comments but not the doctype', () => {
    const text = '<!doctype html>\n<p>x</p>\n<!-- note -->\n<p>y</p>\n<!-- again -->';
    expect(lines('a.html', text)).toEqual([3, 5]);
  });

  it('finds CSS comments but not markers inside strings', () => {
    const text = 'a { content: "/* text */"; }\n/* note */\nb { color: red; }\n';
    expect(lines('a.css', text)).toEqual([2]);
  });

  it('does not look for comments in other file types', () => {
    expect(lines('notes.md', '<!-- hidden -->\n// not code\n')).toEqual([]);
    expect(lines('data.json', '{"url": "http://example.com"}\n')).toEqual([]);
  });
});

describe('dashes', () => {
  it.each(['a.ts', 'a.md', 'a.wgsl', 'a.html', 'a.css', 'a.json', 'a.yml', 'a.svg'])(
    'finds an em dash and an en dash in %s',
    (fileName) => {
      const text = `first line\nsecond ${emDash} line\nthird ${enDash} line\n`;
      expect(findDashViolations(fileName, text).map((violation) => violation.line)).toEqual([2, 3]);
    },
  );

  it('accepts hyphens, minus signs and arrows', () => {
    const text = `a-b ${minusSign}1 -> done\n`;
    expect(findDashViolations('a.md', text)).toEqual([]);
  });

  it('ignores file types the dash rule does not cover', () => {
    expect(findDashViolations('picture.png', emDash)).toEqual([]);
  });
});

describe('device API guard', () => {
  const deviceText = 'const buffer = device.createBuffer({ size: 4, usage: 0 });\n';
  const listed = ['src/gpu/smoke.ts'];

  it('fails an unlisted source file that creates a buffer', () => {
    const found = findDeviceCallViolations('src/gpu/other.ts', deviceText, listed);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'device-call', line: 1 });
  });

  it.each([
    'device.createTexture({})',
    'device.createComputePipeline({})',
    'device.createRenderPipeline({})',
    'device.createShaderModule({ code })',
    'device.createBindGroup({})',
    'device.createCommandEncoder()',
    'device.queue.writeBuffer(buffer, 0, data)',
    'device.queue.submit([commands])',
    "canvas.getContext('webgpu')",
    'canvas.getContext( "webgpu" )',
  ])('recognizes %s', (call) => {
    expect(findDeviceCallViolations('src/gpu/other.ts', call, listed)).toHaveLength(1);
  });

  it('reports the line of the first call', () => {
    const text = `const a = 1;\nconst b = 2;\n${deviceText}`;
    expect(findDeviceCallViolations('src/gpu/other.ts', text, listed)[0]?.line).toBe(3);
  });

  it('accepts a listed file', () => {
    expect(findDeviceCallViolations('src/gpu/smoke.ts', deviceText, listed)).toEqual([]);
  });

  it('accepts specs, test support, declaration files and files outside src', () => {
    expect(findDeviceCallViolations('src/gpu/other.spec.ts', deviceText, listed)).toEqual([]);
    expect(findDeviceCallViolations('src/gpu/testing/fake.ts', deviceText, listed)).toEqual([]);
    expect(findDeviceCallViolations('src/gpu/types.d.ts', deviceText, listed)).toEqual([]);
    expect(findDeviceCallViolations('e2e/parity.spec.ts', deviceText, listed)).toEqual([]);
    expect(findDeviceCallViolations('bench/gpu-bench.ts', deviceText, listed)).toEqual([]);
  });

  it('accepts adapter and device requests, which the fakes in the unit tests cover', () => {
    const text = 'const adapter = await gpu.requestAdapter();\nawait adapter.requestDevice();\n';
    expect(findDeviceCallViolations('src/gpu/device.ts', text, listed)).toEqual([]);
  });

  it('does not mistake similar names for device calls', () => {
    const text = 'const created = createBufferView(1);\nconst submit = queue.submitted;\n';
    expect(findDeviceCallViolations('src/gpu/other.ts', text, listed)).toEqual([]);
  });
});

describe('with files on disk', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'fieldline-style-'));
    roots.push(root);
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), content);
    }
    return root;
  }

  it('reports a stale exclusion entry', () => {
    const root = project({ 'src/gpu/present.ts': 'export {};\n' });
    expect(findStaleExclusions(root, ['src/gpu/present.ts'])).toEqual([]);
    expect(findStaleExclusions(root, ['src/gpu/missing.ts'])).toEqual([
      expect.objectContaining({ file: 'src/gpu/missing.ts', rule: 'stale-exclusion' }),
    ]);
  });

  it('skips generated folders, the private notes and the lockfile', () => {
    const root = project({
      'src/a.ts': 'export {};\n',
      'node_modules/pkg/index.js': `// ${emDash}\n`,
      'dist/app/main.js': `// ${emDash}\n`,
      '.angular/cache/x.json': emDash,
      'coverage/index.html': '<!-- x -->',
      '.artifacts/reference/notes.md': emDash,
      'BRIEF.md': emDash,
      'NOTES_FOR_ADRIAN.md': emDash,
      'pnpm-lock.yaml': enDash,
    });
    expect(collectFiles(root)).toEqual(['src/a.ts']);
  });

  it('passes a clean project', () => {
    const root = project({
      'src/a.ts': 'export const a = 1;\n',
      'src/gpu/smoke.ts': 'export const smoke = device.createBuffer({});\n',
      'src/app/app.html': '<p>text</p>\n',
      'README.md': '# Title\n',
    });
    expect(runCheck(root, ['src/gpu/smoke.ts'])).toEqual([]);
  });

  it('reports one violation of each rule', () => {
    const root = project({
      'src/a.ts': 'export const a = 1; // note\n',
      'README.md': `A ${emDash} B\n`,
      'src/gpu/other.ts': 'export const b = device.createBuffer({});\n',
    });
    const rules = runCheck(root, ['src/gpu/gone.ts']).map((violation) => violation.rule);
    expect(rules.sort()).toEqual(['comment', 'dash', 'device-call', 'stale-exclusion']);
  });

  it('reports the path relative to the project root', () => {
    const root = project({ 'docs/guide.md': `fine\n${emDash}\n` });
    expect(runCheck(root, [])).toEqual([
      expect.objectContaining({ file: 'docs/guide.md', line: 2, rule: 'dash' }),
    ]);
  });
});
