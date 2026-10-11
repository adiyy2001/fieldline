import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { callAutomation, openAutomation } from '../e2e/automation';
import { isDemoSceneName } from '../src/app/automation/demo-scenes';
import { webGpuLaunchArguments } from './chromium-flags';
import {
  DEMO_SEGMENTS,
  type RecordedFrame,
  concatList,
  frameDurations,
  totalSeconds,
} from './demo-timeline';
import { createDistServer, host } from './serve-dist';

const PORT = Number(process.env['FIELDLINE_DEMO_PORT'] ?? 4334);
const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 1000;
const GIF_FRAMES_PER_SECOND = 25;
const MAXIMUM_BYTES = 8 * 1024 * 1024;
const frameDirectory = resolve('.artifacts', 'demo');
const outputPath = resolve('docs', 'img', 'demo.gif');

async function showCaption(page: Page, caption: string): Promise<void> {
  await page.evaluate((text) => {
    document.getElementById('demo-caption')?.remove();
    const banner = document.createElement('div');
    banner.id = 'demo-caption';
    banner.textContent = text;
    banner.setAttribute('aria-hidden', 'true');
    banner.style.cssText =
      'position:fixed;right:16px;top:14px;z-index:9999;max-width:340px;padding:8px 14px;border-radius:6px;background:rgba(15,23,42,0.92);color:#fff;font:600 15px system-ui,sans-serif;line-height:1.3;pointer-events:none';
    document.body.append(banner);
  }, caption);
}

async function captureFrames(): Promise<readonly RecordedFrame[]> {
  const server = createDistServer(resolve('dist/fieldline/browser'));
  await new Promise<void>((done) => {
    server.listen(PORT, host, done);
  });
  const browser = await chromium.launch({ args: [...webGpuLaunchArguments] });
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      baseURL: `http://${host}:${String(PORT)}`,
    });
    page.setDefaultTimeout(120_000);
    await openAutomation(page);
    const frames: RecordedFrame[] = [];
    for (const segment of DEMO_SEGMENTS) {
      if (!isDemoSceneName(segment.scene)) {
        throw new Error(`Unknown demo scene ${segment.scene}`);
      }
      const run = await callAutomation(page, 'scene', segment.scene);
      await showCaption(page, segment.caption);
      const durations = frameDurations(segment, run.frameCount);
      for (const [index, seconds] of durations.entries()) {
        await callAutomation(page, 'sceneFrame', index);
        await callAutomation(page, 'settle');
        const path = join(frameDirectory, `${segment.scene}-${String(index).padStart(3, '0')}.png`);
        await page.screenshot({ path });
        frames.push({ path, seconds });
      }
    }
    return frames;
  } finally {
    await browser.close();
    server.close();
  }
}

function encode(frames: readonly RecordedFrame[]): void {
  const listPath = join(frameDirectory, 'frames.txt');
  writeFileSync(listPath, concatList(frames));
  const filter = [
    `fps=${String(GIF_FRAMES_PER_SECOND)}`,
    `scale=${String(GIF_WIDTH)}:-1:flags=lanczos`,
    'split[colors][pixels]',
    '[colors]palettegen=max_colors=192:stats_mode=diff[palette]',
    '[pixels][palette]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  ].join(',');
  const result = spawnSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-vf',
      filter,
      outputPath,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error('ffmpeg failed');
  }
}

rmSync(frameDirectory, { recursive: true, force: true });
mkdirSync(frameDirectory, { recursive: true });
mkdirSync(resolve('docs', 'img'), { recursive: true });
const recorded = await captureFrames();
encode(recorded);
const bytes = statSync(outputPath).size;
console.log(
  `${String(recorded.length)} frames, ${totalSeconds(recorded).toFixed(1)} s, ${(bytes / 1024 / 1024).toFixed(2)} MB, ${outputPath}`,
);
if (bytes > MAXIMUM_BYTES) {
  console.error('The GIF is larger than 8 MB');
  process.exitCode = 1;
}
