// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { SecureSurface } from './SecureSurface';

const mocks = vi.hoisted(() => ({
  native: true,
  hold: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../client/config', () => ({ isAndroidApp: () => mocks.native }));
vi.mock('../client/secureScreen', () => ({ holdSecureScreen: mocks.hold }));

let settle: { confirm: () => void; refuse: () => void };

beforeEach(() => {
  mocks.native = true;
  mocks.hold.mockReset();
  mocks.release.mockReset();
  mocks.hold.mockImplementation(() => {
    const ready = new Promise<void>((confirm, refuse) => {
      settle = { confirm, refuse: () => refuse(new Error('unavailable')) };
    });
    ready.catch(() => undefined);
    return { ready, release: mocks.release };
  });
});
afterEach(cleanup);

const wrapper = (text: string) =>
  screen.getByText(text).parentElement as HTMLElement;

describe('SecureSurface', () => {
  it('keeps private content unpainted until the app confirms protection', async () => {
    render(
      <SecureSurface>
        <p>A private note</p>
      </SecureSurface>,
    );
    expect(mocks.hold).toHaveBeenCalledTimes(1);
    expect(wrapper('A private note').style.visibility).toBe('hidden');
    await act(async () => settle.confirm());
    expect(wrapper('A private note').style.visibility).toBe('');
  });

  it('stays unpainted and can announce it when protection fails', async () => {
    render(
      <SecureSurface announceFailure>
        <p>A private note</p>
      </SecureSurface>,
    );
    await act(async () => settle.refuse());
    expect(wrapper('A private note').style.visibility).toBe('hidden');
    expect(screen.getByRole('alert').textContent).toBe(
      i18n.t('privateArea.secureScreenUnavailable'),
    );
  });

  it('holds nothing for shared content and hides at once when it turns private', async () => {
    const view = render(
      <SecureSurface active={false}>
        <p>A moment</p>
      </SecureSurface>,
    );
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(wrapper('A moment').style.visibility).toBe('');
    view.rerender(
      <SecureSurface active>
        <p>A moment</p>
      </SecureSurface>,
    );
    expect(wrapper('A moment').style.visibility).toBe('hidden');
    await act(async () => settle.confirm());
    expect(wrapper('A moment').style.visibility).toBe('');
    view.rerender(
      <SecureSurface active={false}>
        <p>A moment</p>
      </SecureSurface>,
    );
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('releases its hold when it leaves', async () => {
    const view = render(
      <SecureSurface>
        <p>A private note</p>
      </SecureSurface>,
    );
    await act(async () => settle.confirm());
    view.unmount();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('renders unchanged in a browser, without a wrapper or a hold', () => {
    mocks.native = false;
    const { container } = render(
      <SecureSurface>
        <p>A private note</p>
      </SecureSurface>,
    );
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(container.firstElementChild?.tagName).toBe('P');
  });
});
