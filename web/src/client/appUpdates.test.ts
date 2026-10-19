import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appUpdatesAvailable, checkAppUpdatesIfDue } from './appUpdates';

const core = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
  checkIfDue: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: core.getPlatform,
    isPluginAvailable: core.isPluginAvailable,
  },
  registerPlugin: core.register,
}));
beforeEach(() => {
  vi.clearAllMocks();
  core.getPlatform.mockReturnValue('android');
  core.isPluginAvailable.mockReturnValue(true);
  core.checkIfDue.mockResolvedValue({});
  core.register.mockReturnValue({ checkIfDue: core.checkIfDue });
});
afterEach(() => vi.unstubAllEnvs());

describe('test app update capability', () => {
  it('does not activate or register a bridge in an ordinary build', () => {
    vi.stubEnv('VITE_EIMIR_TEST_UPDATES', 'false');
    expect(appUpdatesAvailable()).toBe(false);
    checkAppUpdatesIfDue();
    expect(core.register).not.toHaveBeenCalled();
  });
  it('requires both an Android container and its sideload native plugin', () => {
    vi.stubEnv('VITE_EIMIR_TEST_UPDATES', 'true');
    core.getPlatform.mockReturnValue('web');
    expect(appUpdatesAvailable()).toBe(false);
    core.getPlatform.mockReturnValue('android');
    core.isPluginAvailable.mockReturnValue(false);
    expect(appUpdatesAvailable()).toBe(false);
    core.isPluginAvailable.mockReturnValue(true);
    expect(appUpdatesAvailable()).toBe(true);
    checkAppUpdatesIfDue();
    expect(core.checkIfDue).toHaveBeenCalledOnce();
  });
});
