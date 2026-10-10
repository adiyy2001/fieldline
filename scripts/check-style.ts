import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { excludedFromCoverage } from './device-bound-files.ts';

export type Rule = 'comment' | 'dash' | 'device-call' | 'stale-exclusion';

export interface Violation {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  '.angular',
  'coverage',
  '.git',
  '.artifacts',
  'playwright-report',
  'test-results',
]);
const ignoredFiles = new Set(['BRIEF.md', 'NOTES_FOR_ADRIAN.md', 'pnpm-lock.yaml']);
const scriptExtensions = new Set(['.ts', '.js', '.mjs']);
const commentExtensions = new Set([...scriptExtensions, '.wgsl', '.html', '.css']);
const dashExtensions = new Set([...commentExtensions, '.md', '.json', '.yml', '.yaml', '.svg']);
const dashPattern = /[\u2013\u2014]/;

const deviceMethodNames = [
  'createBuffer',
  'createTexture',
  'createSampler',
  'createShaderModule',
  'createBindGroup',
  'createBindGroupLayout',
  'createPipelineLayout',
  'createComputePipeline',
  'createRenderPipeline',
  'createComputePipelineAsync',
  'createRenderPipelineAsync',
  'createCommandEncoder',
  'createRenderBundleEncoder',
  'createQuerySet',
  'writeBuffer',
  'writeTexture',
  'copyExternalImageToTexture',
  'importExternalTexture',
];
const deviceCallPattern = new RegExp(
  `\\b(?:${deviceMethodNames.join('|')})\\s*\\(` +
    `|\\bqueue\\s*\\.\\s*submit\\s*\\(` +
    `|getContext\\(\\s*['"]webgpu['"]\\s*\\)`,
);

function lineAt(text: string, position: number): number {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function scriptCommentPositions(fileName: string, text: string): number[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const positions = new Set<number>();
  const visit = (node: ts.Node): void => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ];
    for (const range of ranges) {
      positions.add(range.pos);
    }
    node.getChildren(source).forEach(visit);
  };
  visit(source);
  return [...positions].sort((left, right) => left - right);
}

function wgslCommentPositions(text: string): number[] {
  const positions: number[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('//', index)) {
      positions.push(index);
      const lineEnd = text.indexOf('\n', index);
      index = lineEnd === -1 ? text.length : lineEnd + 1;
    } else if (text.startsWith('/*', index)) {
      positions.push(index);
      index = endOfNestedBlockComment(text, index);
    } else {
      index += 1;
    }
  }
  return positions;
}

function endOfNestedBlockComment(text: string, start: number): number {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    if (text.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else if (text.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) {
        return index;
      }
    } else {
      index += 1;
    }
  }
  return text.length;
}

function cssCommentPositions(text: string): number[] {
  const positions: number[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '"' || character === "'") {
      const close = text.indexOf(character, index + 1);
      index = close === -1 ? text.length : close + 1;
    } else if (text.startsWith('/*', index)) {
      positions.push(index);
      const close = text.indexOf('*/', index + 2);
      index = close === -1 ? text.length : close + 2;
    } else {
      index += 1;
    }
  }
  return positions;
}

function htmlCommentPositions(text: string): number[] {
  const positions: number[] = [];
  let index = text.indexOf('<!--');
  while (index !== -1) {
    positions.push(index);
    const close = text.indexOf('-->', index + 4);
    index = close === -1 ? -1 : text.indexOf('<!--', close + 3);
  }
  return positions;
}

function commentPositions(fileName: string, text: string): number[] {
  const extension = extname(fileName);
  if (scriptExtensions.has(extension)) {
    return scriptCommentPositions(fileName, text);
  }
  switch (extension) {
    case '.wgsl':
      return wgslCommentPositions(text);
    case '.css':
      return cssCommentPositions(text);
    case '.html':
      return htmlCommentPositions(text);
    default:
      return [];
  }
}

export function findCommentViolations(fileName: string, text: string): Violation[] {
  return commentPositions(fileName, text).map((position) => ({
    file: fileName,
    line: lineAt(text, position),
    rule: 'comment',
    message: 'comments are not allowed, rename instead',
  }));
}

export function findDashViolations(fileName: string, text: string): Violation[] {
  if (!dashExtensions.has(extname(fileName))) {
    return [];
  }
  return text.split('\n').flatMap((content, index) =>
    dashPattern.test(content)
      ? [
          {
            file: fileName,
            line: index + 1,
            rule: 'dash' as const,
            message: 'en and em dashes are not allowed',
          },
        ]
      : [],
  );
}

function isProductionSource(fileName: string): boolean {
  return (
    fileName.startsWith('src/') &&
    fileName.endsWith('.ts') &&
    !fileName.endsWith('.spec.ts') &&
    !fileName.endsWith('.d.ts') &&
    !fileName.includes('/testing/')
  );
}

export function findDeviceCallViolations(
  fileName: string,
  text: string,
  deviceBound: readonly string[],
): Violation[] {
  if (!isProductionSource(fileName) || deviceBound.includes(fileName)) {
    return [];
  }
  const match = deviceCallPattern.exec(text);
  if (match === null) {
    return [];
  }
  return [
    {
      file: fileName,
      line: lineAt(text, match.index),
      rule: 'device-call',
      message: `calls a WebGPU device API but is not listed in scripts/device-bound-files.ts: ${match[0]}`,
    },
  ];
}

export function findStaleExclusions(root: string, deviceBound: readonly string[]): Violation[] {
  return deviceBound
    .filter((file) => !existsSync(join(root, file)))
    .map((file) => ({
      file,
      line: 1,
      rule: 'stale-exclusion',
      message: 'listed in scripts/device-bound-files.ts but the file does not exist',
    }));
}

export function collectFiles(root: string, directory = ''): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = directory === '' ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectFiles(root, relativePath);
    }
    const checked = dashExtensions.has(extname(entry.name)) && !ignoredFiles.has(relativePath);
    return checked ? [relativePath] : [];
  });
}

export function runCheck(
  root: string,
  deviceBound: readonly string[] = excludedFromCoverage,
): Violation[] {
  const fileViolations = collectFiles(root).flatMap((file) => {
    const text = readFileSync(join(root, file), 'utf8');
    return [
      ...findCommentViolations(file, text),
      ...findDashViolations(file, text),
      ...findDeviceCallViolations(file, text, deviceBound),
    ];
  });
  return [...fileViolations, ...findStaleExclusions(root, deviceBound)];
}

function reportAndExit(): void {
  const violations = runCheck(process.cwd());
  for (const violation of violations) {
    console.error(
      `${violation.file}:${String(violation.line)} [${violation.rule}] ${violation.message}`,
    );
  }
  console.log(
    violations.length === 0
      ? 'check:style passed'
      : `check:style found ${String(violations.length)} problems`,
  );
  process.exitCode = violations.length === 0 ? 0 : 1;
}

const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (invokedDirectly) {
  reportAndExit();
}
