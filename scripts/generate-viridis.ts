import { readFileSync, writeFileSync } from 'node:fs';

const source = process.argv[2];
const target = process.argv[3];
if (source === undefined || target === undefined) {
  throw new Error('usage: tsx scripts/generate-viridis.ts <colormaps.py> <output.ts>');
}

const text = readFileSync(source, 'utf8');
const start = text.indexOf('_viridis_data = [');
const end = text.indexOf(']]', start) + 2;
const block = text.slice(start, end);
const entries = [...block.matchAll(/\[\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\s*\]/g)].map(
  (match) => `  [${match[1] ?? ''}, ${match[2] ?? ''}, ${match[3] ?? ''}],`,
);
if (entries.length !== 256) {
  throw new Error(`expected 256 viridis entries, found ${String(entries.length)}`);
}
const body = [
  'export type Rgb = readonly [number, number, number];',
  '',
  'export const VIRIDIS: readonly Rgb[] = [',
  ...entries,
  '];',
  '',
].join('\n');
writeFileSync(target, body);
