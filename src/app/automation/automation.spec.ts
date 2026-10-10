import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DEVICE_ACQUIRER } from '../services/gpu-status';
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
});
