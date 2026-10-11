import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DEVICE_ACQUIRER } from '../services/gpu-status';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import { Automation, type AutomationHost, installAutomation } from './automation';
import { isAutomationRequested } from './automation-query';
import type { FieldlineAutomation } from './automation-types';

const stub = {} as FieldlineAutomation;

describe('the automation hook', () => {
  it('is requested by the query parameter and nothing else', () => {
    expect(isAutomationRequested('?automation')).toBe(true);
    expect(isAutomationRequested('?view=ground&automation=1')).toBe(true);
    expect(isAutomationRequested('')).toBe(false);
    expect(isAutomationRequested('?automations=1')).toBe(false);
  });

  it('installs the object only when requested and only once', () => {
    const host: AutomationHost = {};
    expect(installAutomation(host, '?view=ground', () => stub)).toBe(false);
    expect(host.fieldline).toBeUndefined();
    expect(installAutomation(host, '?automation', () => stub)).toBe(true);
    expect(host.fieldline).toBe(stub);
    expect(installAutomation(host, '?automation', () => ({}) as FieldlineAutomation)).toBe(false);
    expect(host.fieldline).toBe(stub);
  });

  it('installs a working object through the Angular service', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DEVICE_ACQUIRER,
          useValue: () =>
            Promise.resolve({ status: 'unsupported', reason: 'no-api', detail: 'none' }),
        },
      ],
    });
    const host: AutomationHost = {};
    expect(TestBed.inject(Automation).installIfRequested(host, '?automation')).toBe(true);
    expect(await host.fieldline?.adapter()).toBeNull();
    const untouched: AutomationHost = {};
    expect(TestBed.inject(Automation).installIfRequested(untouched, '')).toBe(false);
  });

  it('drives the store and reads its state through the bridge', async () => {
    TestBed.configureTestingModule({ providers: storeProviders() });
    const host: AutomationHost = {};
    TestBed.inject(Automation).installIfRequested(host, '?automation');
    const api = host.fieldline;
    expect(api).toBeDefined();
    await api?.settle();
    expect(api?.appState()?.status).toBe('ready');
    expect(api?.groundFrame()?.values.length).toBeGreaterThan(0);
    await api?.setParameters({ lineToLineKilovolts: 300 });
    expect(api?.appState()?.parameters.lineToLineKilovolts).toBe(300);
    await api?.setSettings({ quantity: 'magnetic' });
    expect(api?.appState()?.settings.quantity).toBe('magnetic');
    await api?.setPhase(45);
    expect(api?.appState()?.settings.phaseDegrees).toBe(45);
    expect(api?.appState()?.playing).toBe(false);
    await api?.setCamera({ view: 'volume', yaw: 0.5 });
    await api?.setView('profile');
    expect(api?.appState()?.settings.view).toBe('profile');
    expect(api?.readField('ground')?.length).toBeGreaterThan(0);
    expect(await api?.captureFrame({ width: 8, height: 8 })).toBeNull();
  });

  it('runs a demo scene and steps its frames', async () => {
    TestBed.configureTestingModule({ providers: storeProviders() });
    const host: AutomationHost = {};
    TestBed.inject(Automation).installIfRequested(host, '?automation');
    const api = host.fieldline;
    const run = await api?.scene('profile-chart');
    expect(run?.frameCount).toBeGreaterThan(1);
    await api?.sceneFrame(1);
    await until(() => api?.appState()?.status === 'ready');
    expect(api?.appState()?.parameters.phaseSag).not.toBe(10);
  });
});
