import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import type { AiWorkflowApi } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from './electron-api';
import { FeatureFlags, feature } from './feature-flags';

@Component({ template: 'home' })
class HomeStub {}
@Component({ template: 'meetings page' })
class MeetingsStub {}

function setup(bridge: Pick<AiWorkflowApi, 'features'> | null) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge },
      provideRouter([
        { path: '', component: HomeStub },
        { path: 'meetings', canMatch: [feature('meetings')], component: MeetingsStub },
        { path: '**', redirectTo: '' },
      ]),
    ],
  });
  return TestBed.inject(FeatureFlags);
}

const bridgeWith = (flags: object | Promise<never>) =>
  ({
    features: {
      get: () =>
        flags instanceof Promise ? flags : Promise.resolve({ flags, sources: ['registry'] }),
    },
  }) as Pick<AiWorkflowApi, 'features'>;

describe('FeatureFlags', () => {
  it('everything off before loading and without the desktop bridge', async () => {
    const flags = setup(null);
    await flags.load();
    expect(flags.enabled('meetings')).toBe(false);
    expect(flags.enabled('voiceprints')).toBe(false);
  });

  it('takes only true values from the policy', async () => {
    const flags = setup(bridgeWith({ meetings: true, agents: 'yes', voiceprints: 1 }));
    await flags.load();
    expect(flags.enabled('meetings')).toBe(true);
    expect(flags.enabled('agents')).toBe(false);
    expect(flags.enabled('voiceprints')).toBe(false);
  });

  it('stays all off when the policy call fails', async () => {
    const flags = setup(bridgeWith(Promise.reject(new Error('gone'))));
    await flags.load();
    expect(flags.enabled('meetings')).toBe(false);
  });

  it('route guard: a flagged route does not exist while its flag is off', async () => {
    const flags = setup(bridgeWith({ meetings: false }));
    await flags.load();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/meetings');
    expect(router.url).toBe('/');
  });

  it('route guard: the route opens when the flag is on', async () => {
    const flags = setup(bridgeWith({ meetings: true }));
    await flags.load();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/meetings');
    expect(router.url).toBe('/meetings');
  });
});
