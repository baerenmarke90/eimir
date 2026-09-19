// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { App } from '@capacitor/app';
import { handleNativeBackButton } from './capacitorShell';

vi.mock('@capacitor/app', () => ({
  App: {
    exitApp: vi.fn(),
    addListener: vi.fn(),
  },
}));

describe('Capacitor native shell integration', () => {
  it('navigates browser history back when canGoBack is true', () => {
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});
    handleNativeBackButton(true);
    expect(backSpy).toHaveBeenCalledOnce();
    expect(App.exitApp).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it('exits application when canGoBack is false', () => {
    const backSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});
    handleNativeBackButton(false);
    expect(backSpy).not.toHaveBeenCalled();
    expect(App.exitApp).toHaveBeenCalledOnce();
    backSpy.mockRestore();
  });
});
