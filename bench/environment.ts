import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';

export interface BenchEnvironment {
  readonly date: string;
  readonly commit: string;
  readonly node: string;
  readonly os: string;
  readonly cpu: string;
  readonly logicalCpus: number;
}

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function describeEnvironment(): BenchEnvironment {
  const processors = cpus();
  return {
    date: new Date().toISOString(),
    commit: gitCommit(),
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: processors[0]?.model ?? 'unknown',
    logicalCpus: processors.length,
  };
}
