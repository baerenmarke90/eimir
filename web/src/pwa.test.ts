import { describe, expect, it } from 'vitest';
import { canRegisterProductionServiceWorker } from './pwa';

describe('PWA service-worker registration', () => {
  it('registers only for supported production clients in browser environments', () => {
    expect(canRegisterProductionServiceWorker(true, true, false)).toBe(true);
    expect(canRegisterProductionServiceWorker(false, true, false)).toBe(false);
    expect(canRegisterProductionServiceWorker(true, false, false)).toBe(false);
    expect(canRegisterProductionServiceWorker(false, false, false)).toBe(false);
  });

  it('never registers inside native Capacitor container', () => {
    expect(canRegisterProductionServiceWorker(true, true, true)).toBe(false);
    expect(canRegisterProductionServiceWorker(false, true, true)).toBe(false);
    expect(canRegisterProductionServiceWorker(true, false, true)).toBe(false);
    expect(canRegisterProductionServiceWorker(false, false, true)).toBe(false);
  });
});
