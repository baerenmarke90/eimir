// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdatesAdapter, AppUpdateState } from '../client/appUpdates';
import copy from '../i18n/locales/appUpdates';
import { AppUpdatesPanel } from './AppUpdatesPanel';

const initial: AppUpdateState = {
  revision: 1,
  phase: 'idle',
  busy: false,
  versionName: '0.2.0-test.1',
  versionCode: 1,
  sourceRevision: 'a'.repeat(40),
  progress: 0,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function fixture(state = initial) {
  let listener: ((value: AppUpdateState) => void) | undefined;
  const remove = vi.fn();
  const adapter: AppUpdatesAdapter = {
    getState: vi.fn().mockResolvedValue(state),
    check: vi
      .fn()
      .mockResolvedValue({ ...state, revision: 2, phase: 'noRelease' }),
    checkIfDue: vi.fn().mockResolvedValue(state),
    download: vi.fn().mockResolvedValue(state),
    cancel: vi.fn().mockResolvedValue(state),
    install: vi.fn().mockResolvedValue(state),
    addListener: vi.fn().mockImplementation(async (_event, next) => {
      listener = next;
      return { remove };
    }),
  };
  return {
    adapter,
    remove,
    emit: (next: AppUpdateState) => act(() => listener?.(next)),
  };
}
afterEach(cleanup);

describe('AppUpdatesPanel', () => {
  it('starts with installed identity and distinguishes an absent release from current', async () => {
    const { adapter } = fixture();
    render(<AppUpdatesPanel adapter={adapter} />);
    await screen.findByText('Installiert: 0.2.0-test.1');
    fireEvent.click(screen.getByRole('button', { name: copy.check }));
    await screen.findByText(copy.phases.noRelease);
    expect(screen.queryByText(copy.phases.current)).toBeNull();
    expect(adapter.check).toHaveBeenCalledOnce();
    expect(adapter.install).not.toHaveBeenCalled();
  });

  it('admits one download, keeps cancellation available, and never auto-installs ready bytes', async () => {
    const available: AppUpdateState = {
      ...initial,
      phase: 'available',
      available: {
        versionName: '0.2.0-test.2',
        versionCode: 2,
        releaseNotes: 'A tested change.',
      },
    };
    const f = fixture(available);
    const download = deferred<AppUpdateState>();
    vi.mocked(f.adapter.download).mockReturnValue(download.promise);
    render(<AppUpdatesPanel adapter={f.adapter} />);
    const button = await screen.findByRole('button', { name: copy.download });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(f.adapter.download).toHaveBeenCalledOnce();
    f.emit({
      ...available,
      revision: 3,
      phase: 'downloading',
      progress: 42,
      busy: true,
    });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('42');
    fireEvent.click(screen.getByRole('button', { name: copy.cancel }));
    expect(f.adapter.cancel).toHaveBeenCalledOnce();
    await act(async () =>
      download.resolve({ ...available, revision: 4, phase: 'ready' }),
    );
    expect(f.adapter.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.install }));
    await waitFor(() => expect(f.adapter.install).toHaveBeenCalledOnce());
  });

  it('preserves permission context and requires another explicit installation action', async () => {
    const f = fixture({ ...initial, phase: 'permissionRequired' });
    render(<AppUpdatesPanel adapter={f.adapter} />);
    await screen.findByText(copy.permission);
    f.emit({ ...initial, revision: 4, phase: 'permissionRequired' });
    expect(f.adapter.install).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.installAgain }));
    await waitFor(() => expect(f.adapter.install).toHaveBeenCalledOnce());
  });

  it('does not overwrite a newer native event with a delayed initial snapshot', async () => {
    const f = fixture();
    const read = deferred<AppUpdateState>();
    vi.mocked(f.adapter.getState).mockReturnValue(read.promise);
    render(<AppUpdatesPanel adapter={f.adapter} />);
    await waitFor(() => expect(f.adapter.getState).toHaveBeenCalledOnce());
    f.emit({ ...initial, revision: 8, phase: 'current' });
    await act(async () => read.resolve(initial));
    expect(screen.getByText(copy.phases.current)).toBeTruthy();
    expect(screen.queryByText(copy.phases.idle)).toBeNull();
  });

  it('shows actionable service failure without a false up-to-date claim', async () => {
    const f = fixture({ ...initial, phase: 'error', errorCode: 'NETWORK' });
    render(<AppUpdatesPanel adapter={f.adapter} />);
    await screen.findByRole('alert');
    expect(screen.getByText(copy.connectionError)).toBeTruthy();
    expect(screen.queryByText(copy.phases.current)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    await waitFor(() => expect(f.adapter.check).toHaveBeenCalledOnce());
  });

  it('renders remote release notes as text and releases late subscriptions on unmount', async () => {
    const f = fixture({
      ...initial,
      phase: 'available',
      available: {
        versionName: '0.2.0-test.2',
        versionCode: 2,
        releaseNotes: '<img src=x onerror=alert(1)>',
      },
    });
    const view = render(<AppUpdatesPanel adapter={f.adapter} />);
    await screen.findByText('<img src=x onerror=alert(1)>');
    expect(view.container.querySelector('img')).toBeNull();
    view.unmount();
    await waitFor(() => expect(f.remove).toHaveBeenCalledOnce());
  });
});
