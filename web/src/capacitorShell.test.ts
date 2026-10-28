// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { App } from '@capacitor/app';
import { handleNativeBackButton, useCapacitorShell } from './capacitorShell';
import { isCapacitorNative } from './pwa';

vi.mock('@capacitor/app', () => ({
  App: {
    exitApp: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock('./pwa', () => ({ isCapacitorNative: vi.fn(() => true) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCapacitorNative).mockReturnValue(true);
  vi.mocked(App.addListener).mockImplementation(async () => ({
    remove: vi.fn(),
  }));
  focusManager.setFocused(undefined);
});

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
});

function nativeState(isActive: boolean): void {
  // The overloaded plugin method exposes only its last overload to mock.calls.
  const registrations = vi.mocked(App.addListener).mock.calls as unknown as [
    string,
    (state: { isActive: boolean }) => void,
  ][];
  const registration = registrations.find(
    ([event]) => event === 'appStateChange',
  );
  if (!registration) throw new Error('Native lifecycle listener missing');
  act(() => registration[1]({ isActive }));
}

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

  for (const age of [10_000, 120_000]) {
    it(`resumes ${age}ms-old reads through the query observer without a visibility event`, async () => {
      const read = vi.fn(async () => 'updated');
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      const { result, unmount } = renderHook(
        () => {
          useCapacitorShell();
          return useQuery({
            queryKey: ['native-resume'],
            queryFn: read,
            initialData: 'loaded',
            initialDataUpdatedAt: Date.now() - age,
            staleTime: 60_000,
            refetchOnMount: false,
          });
        },
        {
          wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client }, children),
        },
      );
      expect(result.current.data).toBe('loaded');
      expect(read).not.toHaveBeenCalled();
      nativeState(false);
      nativeState(true);
      if (age < 60_000) {
        await act(async () => {});
        expect(read).not.toHaveBeenCalled();
        expect(result.current.data).toBe('loaded');
      } else {
        await waitFor(() => expect(result.current.data).toBe('updated'));
        expect(read).toHaveBeenCalledOnce();
      }
      unmount();
      client.clear();
    });
  }

  it('marks native backgrounding unfocused and ignores callbacks after unmount', async () => {
    const focus = vi.fn();
    window.addEventListener('focus', focus);
    const { unmount } = renderHook(useCapacitorShell);
    nativeState(false);
    expect(focusManager.isFocused()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    unmount();
    await act(async () => {});
    nativeState(true);
    expect(focus).not.toHaveBeenCalled();
    nativeState(false);
    expect(focusManager.isFocused()).toBe(true);
    window.removeEventListener('focus', focus);
    for (const registration of vi.mocked(App.addListener).mock.results) {
      const listener = await registration.value;
      expect(listener.remove).toHaveBeenCalledOnce();
    }
  });

  it('leaves browser focus handling to the framework on the Web', () => {
    vi.mocked(isCapacitorNative).mockReturnValue(false);
    focusManager.setFocused(false);
    const { unmount } = renderHook(useCapacitorShell);
    expect(App.addListener).not.toHaveBeenCalled();
    unmount();
    expect(focusManager.isFocused()).toBe(false);
  });
});
