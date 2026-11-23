// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureHapticsForTests,
  haptic,
  registerHapticsBackend,
  setHapticsEnabled,
} from './haptics';
import {
  capacitorHapticsBackend,
  registerNativeHaptics,
  resetNativeHapticsForTests,
  systemHapticsBackend,
} from './hapticsNative';

function pluginStub() {
  const calls: string[] = [];
  const record = (name: string) =>
    vi.fn((options?: unknown) => {
      calls.push(options ? `${name}:${JSON.stringify(options)}` : name);
      return Promise.resolve();
    });
  const Haptics = {
    selectionStart: record('selectionStart'),
    selectionChanged: record('selectionChanged'),
    selectionEnd: record('selectionEnd'),
    impact: record('impact'),
    notification: record('notification'),
  };
  const plugin = {
    Haptics,
    ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
    NotificationType: {
      Success: 'SUCCESS',
      Warning: 'WARNING',
      Error: 'ERROR',
    },
  } as unknown as typeof import('@capacitor/haptics');
  return { plugin, calls };
}

afterEach(() => {
  resetNativeHapticsForTests();
  configureHapticsForTests({});
  setHapticsEnabled(true);
  localStorage.clear();
});

describe('native haptics backend (@capacitor/haptics)', () => {
  it('maps the contract triggers to the plugin calls', async () => {
    const { plugin, calls } = pluginStub();
    const backend = capacitorHapticsBackend(plugin);
    backend.selectionChanged();
    backend.impact('light');
    backend.impact('medium');
    backend.notification('success');
    backend.notification('warning');
    await vi.waitFor(() => expect(calls).toContain('selectionEnd'));
    // Android vibrates a selection change only inside a selection, so the
    // three calls arrive in this order.
    expect(calls.filter((call) => call.startsWith('selection'))).toEqual([
      'selectionStart',
      'selectionChanged',
      'selectionEnd',
    ]);
    expect(calls.filter((call) => !call.startsWith('selection'))).toEqual([
      'impact:{"style":"LIGHT"}',
      'impact:{"style":"MEDIUM"}',
      'notification:{"type":"SUCCESS"}',
      'notification:{"type":"WARNING"}',
    ]);
  });

  it('maps the contract triggers to Android system feedback', () => {
    const perform = vi.fn().mockResolvedValue({ played: true });
    const backend = systemHapticsBackend({ perform });
    backend.selectionChanged();
    backend.impact('light');
    backend.impact('medium');
    backend.notification('success');
    backend.notification('warning');
    expect(perform.mock.calls.map(([options]) => options.kind)).toEqual([
      'tick',
      'tap',
      'emphasis',
      'success',
      'refuse',
    ]);
  });

  it('uses system feedback on Android without loading the plugin', async () => {
    const load = vi.fn();
    const perform = vi.fn().mockResolvedValue({ played: true });
    configureHapticsForTests({ native: true, now: () => 0 });
    await expect(
      registerNativeHaptics(
        () => true,
        load,
        () => true,
        { perform },
      ),
    ).resolves.toBe(true);
    expect(load).not.toHaveBeenCalled();
    expect(haptic('press')).toBe(true);
    expect(perform).toHaveBeenCalledWith({ kind: 'tap' });
  });

  it('keeps the app working when system feedback fails', async () => {
    const perform = vi.fn().mockRejectedValue(new Error('unavailable'));
    systemHapticsBackend({ perform }).impact('light');
    await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
  });

  it('never loads the plugin on the Web', async () => {
    const load = vi.fn();
    await expect(registerNativeHaptics(() => false, load)).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('registers once in the native app and plays through the adapter', async () => {
    const { plugin, calls } = pluginStub();
    const load = vi.fn().mockResolvedValue(plugin);
    configureHapticsForTests({ native: true, now: () => 0 });
    await expect(registerNativeHaptics(() => true, load)).resolves.toBe(true);
    await registerNativeHaptics(() => true, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(haptic('commit')).toBe(true);
    expect(calls).toEqual(['impact:{"style":"LIGHT"}']);
  });

  it('stays silent when the in-app switch is off', async () => {
    const { plugin, calls } = pluginStub();
    configureHapticsForTests({ native: true, now: () => 0 });
    await registerNativeHaptics(
      () => true,
      () => Promise.resolve(plugin),
    );
    setHapticsEnabled(false);
    expect(haptic('commit')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('keeps the app working when the plugin cannot load', async () => {
    const load = vi.fn().mockRejectedValue(new Error('missing'));
    await expect(registerNativeHaptics(() => true, load)).resolves.toBe(false);
    registerHapticsBackend(null);
    configureHapticsForTests({ native: true });
    expect(haptic('commit')).toBe(false);
  });
});
