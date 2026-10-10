import type { Page } from '@playwright/test';
import type { FieldlineAutomation } from '../src/app/automation/automation-types.ts';

export type AutomationMethod =
  | 'runParity'
  | 'runMirror'
  | 'runKernelBench'
  | 'runCpuPool'
  | 'runIsosurface'
  | 'runVolumeImage'
  | 'runFieldLines'
  | 'adapter'
  | 'appState'
  | 'groundFrame'
  | 'setParameters'
  | 'setSettings'
  | 'setView'
  | 'setPhase'
  | 'setCamera'
  | 'captureFrame'
  | 'settle';

type Result<M extends AutomationMethod> = Awaited<ReturnType<FieldlineAutomation[M]>>;
type Request<M extends AutomationMethod> = Parameters<FieldlineAutomation[M]>[0];

export async function openAutomation(page: Page): Promise<void> {
  await page.goto('/?automation');
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
}

export async function callAutomation<M extends AutomationMethod>(
  page: Page,
  method: M,
  request?: Request<M>,
): Promise<Result<M>> {
  return page.evaluate(
    ([name, argument]) => {
      const api = (
        window as unknown as { fieldline: Record<string, (value: unknown) => Promise<unknown>> }
      ).fieldline;
      const call = api[name as string];
      if (call === undefined) {
        throw new Error(`fieldline.${name} is missing`);
      }
      return call(argument);
    },
    [method, request] as const,
  ) as Promise<Result<M>>;
}
