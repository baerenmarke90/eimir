import { describe, expect, it } from 'vitest';
import { canRegisterProductionServiceWorker } from './pwa';

describe('PWA service-worker registration', () => {
  it('registers only for supported production clients', () => {
    expect(canRegisterProductionServiceWorker(true, true)).toBe(true);
    expect(canRegisterProductionServiceWorker(false, true)).toBe(false);
    expect(canRegisterProductionServiceWorker(true, false)).toBe(false);
    expect(canRegisterProductionServiceWorker(false, false)).toBe(false);
  });
});
