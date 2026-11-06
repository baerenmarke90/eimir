// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from './useVoiceRecorder';

class Recorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  static last: Recorder;
  constructor() {
    Recorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state !== 'recording') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice']) });
    this.onstop?.();
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(permission?: Promise<MediaStream>) {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const getUserMedia = vi
    .fn()
    .mockReturnValue(permission ?? Promise.resolve(stream));
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const ready = vi.fn();
  const view = renderHook(() => useVoiceRecorder(ready));
  return { ...view, ready, stop, stream, getUserMedia };
}
describe('explicit voice recording lifecycle', () => {
  it('requests permission only on Start, previews only after Stop, and releases tracks', async () => {
    const view = setup();
    expect(view.getUserMedia).not.toHaveBeenCalled();
    await act(() => view.result.current.start());
    expect(view.result.current.phase).toBe('recording');
    expect(view.ready).not.toHaveBeenCalled();
    act(() => view.result.current.stop());
    expect(view.ready).toHaveBeenCalledTimes(1);
    expect(view.stop).toHaveBeenCalled();
    expect(view.ready.mock.calls[0][0].type).toBe('audio/webm');
    view.unmount();
  });
  it('cancel discards data and releases microphone', async () => {
    const view = setup();
    await act(() => view.result.current.start());
    act(() => view.result.current.cancel());
    expect(view.ready).not.toHaveBeenCalled();
    expect(view.stop).toHaveBeenCalled();
    view.unmount();
  });
  it('a permission response arriving after task exit never starts or emits audio', async () => {
    let resolve!: (stream: MediaStream) => void;
    const view = setup(
      new Promise((value) => {
        resolve = value;
      }),
    );
    act(() => {
      void view.result.current.start();
    });
    view.unmount();
    resolve(view.stream);
    await waitFor(() => expect(view.stop).toHaveBeenCalled());
    expect(view.ready).not.toHaveBeenCalled();
  });
  it('permission denial yields a recoverable localized error key', async () => {
    const view = setup(
      Promise.reject(new DOMException('denied', 'NotAllowedError')),
    );
    await act(() => view.result.current.start());
    expect(view.result.current.phase).toBe('idle');
    expect(view.result.current.error).toBe('permission');
    expect(view.ready).not.toHaveBeenCalled();
    view.unmount();
  });
  it('backgrounding discards a live capture and releases tracks', async () => {
    const view = setup();
    await act(() => view.result.current.start());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(view.ready).not.toHaveBeenCalled();
    expect(view.stop).toHaveBeenCalled();
    view.unmount();
  });
});
