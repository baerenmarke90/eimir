// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { VoiceShareIngress } from './VoiceShareIngress';

HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};

const native = vi.hoisted(() => ({
  available: vi.fn(),
  peek: vi.fn(),
  addListener: vi.fn(),
  remove: vi.fn(),
  discard: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('@capacitor/core', async (original) => ({
  ...(await original<typeof import('@capacitor/core')>()),
  Capacitor: { isPluginAvailable: native.available },
}));
vi.mock('../client/sharedVoiceImport', async (original) => ({
  ...(await original<typeof import('../client/sharedVoiceImport')>()),
  nativeVoiceShare: native,
  clearSharedVoice: native.clear,
  readSharedVoice: vi.fn(),
  stageSharedVoice: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount() {
  return render(
    <MemoryRouter>
      <VoiceShareIngress scope="test" />
    </MemoryRouter>,
  );
}

it('starts silently on a native platform without VoiceShare', () => {
  native.available.mockReturnValue(false);
  mount();
  expect(native.available).toHaveBeenCalledWith('VoiceShare');
  expect(native.addListener).not.toHaveBeenCalled();
  expect(native.peek).not.toHaveBeenCalled();
});

it('observes a new Android selection and releases it on unmount', async () => {
  native.available.mockReturnValue(true);
  native.addListener.mockResolvedValue({ remove: native.remove });
  native.remove.mockResolvedValue(undefined);
  native.discard.mockResolvedValue(undefined);
  native.peek
    .mockResolvedValueOnce({ available: false })
    .mockResolvedValue({ available: true, generation: '2', failed: false });
  const screen = mount();
  await waitFor(() => expect(native.peek).toHaveBeenCalledTimes(1));
  await act(async () => {
    native.addListener.mock.calls[0][1]();
  });
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  screen.unmount();
  expect(native.remove).toHaveBeenCalledOnce();
  expect(native.discard).toHaveBeenCalledWith({ generation: '2' });
});

it('handles listener registration failure while the bridge is shutting down', async () => {
  native.available.mockReturnValue(true);
  native.addListener.mockRejectedValue(new Error('bridge unavailable'));
  native.peek.mockResolvedValue(null);
  mount();
  await waitFor(() => expect(native.peek).toHaveBeenCalledOnce());
});
