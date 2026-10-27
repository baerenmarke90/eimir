// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from './referenceFlow';
import {
  type AttachmentDraftOptions,
  useAttachmentDrafts,
} from './useAttachmentDrafts';

const photo = (name = 'selected.jpg') =>
  new File(['synthetic image'], name, { type: 'image/jpeg' });

function deferredUpload() {
  let resolve!: (value: { attachmentId: string }) => void;
  const promise = new Promise<{ attachmentId: string }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('asynchronous attachment selection ownership (#1444)', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:synthetic-preview');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  function setup(overrides: Partial<AttachmentDraftOptions> = {}) {
    const pending = Array.from({ length: 12 }, () => deferredUpload());
    let next = 0;
    const upload = vi.fn<
      NonNullable<AttachmentDraftOptions['uploadAttachmentFn']>
    >(() => pending[next++].promise);
    const props: AttachmentDraftOptions = {
      apis: {} as ReferenceApis,
      apiBaseUrl: 'https://api.example.test',
      accessToken: 'synthetic-session',
      accountId: 'account-a',
      spaceId: 'space-a',
      maxAttachments: 20,
      uploadAttachmentFn: upload,
      ...overrides,
    };
    return {
      ...renderHook((options) => useAttachmentDrafts(options), {
        initialProps: props,
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        ),
      }),
      props,
      upload,
      pending,
    };
  }

  it('hands off once to the same previews, capacity and READY ordering', async () => {
    const { result, upload, pending } = setup();
    const selection = result.current.beginSelection();
    act(() => {
      expect(selection.commit([photo('first.jpg'), photo('second.jpg')])).toBe(
        true,
      );
      expect(selection.commit([photo('replay.jpg')])).toBe(false);
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending[1].resolve({ attachmentId: 'second-ready' });
      pending[0].resolve({ attachmentId: 'first-ready' });
      await Promise.all([pending[0].promise, pending[1].promise]);
    });
    expect(result.current.readyIds).toEqual(['first-ready', 'second-ready']);
    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'first.jpg',
      'second.jpg',
    ]);
  });

  it.each([
    'account',
    'space',
    'space round trip',
    'server',
    'clear',
    'cancel',
    'unmount',
  ])(
    'rejects a late provider result after %s before preview or upload',
    (change) => {
      const { result, rerender, unmount, props, upload } = setup();
      const selection = result.current.beginSelection();
      act(() => {
        if (change === 'account')
          rerender({ ...props, accountId: 'account-b' });
        if (change.startsWith('space'))
          rerender({ ...props, spaceId: 'space-b' });
        if (change === 'server')
          rerender({ ...props, apiBaseUrl: 'https://other.example.test' });
        if (change === 'clear') result.current.clear();
        if (change === 'cancel') selection.cancel();
        if (change === 'unmount') unmount();
      });
      if (change === 'space round trip') rerender(props);
      expect(selection.signal.aborted).toBe(true);
      // A provider may ignore abort and deliver anyway; the handoff still fails.
      act(() => expect(selection.commit([photo()])).toBe(false));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it('cancels only the pending selection and retains existing draft content', () => {
    const { result, upload } = setup();
    act(() => result.current.addFiles([photo('already-selected.jpg')]));
    const selection = result.current.beginSelection();
    selection.cancel();
    selection.cancel();
    act(() => expect(selection.commit([photo('late.jpg')])).toBe(false));
    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'already-selected.jpg',
    ]);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('uses remaining capacity and current props when selection finishes', () => {
    const { result, rerender, props, upload } = setup();
    const selection = result.current.beginSelection();
    act(() => result.current.addFiles([photo('local.jpg')]));
    rerender({ ...props, maxAttachments: 2, accessToken: 'refreshed-session' });
    act(() =>
      expect(
        selection.commit([photo('remote-a.jpg'), photo('remote-b.jpg')]),
      ).toBe(true),
    );
    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'local.jpg',
      'remote-a.jpg',
    ]);
    expect(result.current.rejectedCount).toBe(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1]?.[2]).toBe('refreshed-session');
  });

  it('does not allow a retained begin function to allocate after unmount', () => {
    const { result, unmount, upload } = setup();
    const begin = result.current.beginSelection;
    unmount();
    const selection = begin();
    expect(selection.signal.aborted).toBe(true);
    expect(selection.commit([photo()])).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('clear aborts all concurrent selection handles and permits a fresh selection', () => {
    const { result, upload } = setup();
    const a = result.current.beginSelection();
    const b = result.current.beginSelection();
    act(() => result.current.clear());
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    const fresh = result.current.beginSelection();
    act(() => expect(fresh.commit([photo()])).toBe(true));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('retains diary restoration and reordering while applying current selection capacity', () => {
    const { result, upload } = setup({ maxAttachments: 2 });
    const selection = result.current.beginSelection();
    act(() =>
      result.current.restore([
        { file: photo('recovered.jpg'), attachmentId: 'existing-ready' },
      ]),
    );
    act(() => selection.commit([photo('selected.jpg'), photo('excess.jpg')]));
    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'recovered.jpg',
      'selected.jpg',
    ]);
    expect(result.current.rejectedCount).toBe(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.current.readyIds).toEqual(['existing-ready']);
    const selectedId = result.current.items[1].id;
    act(() => result.current.move(selectedId, -1));
    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'selected.jpg',
      'recovered.jpg',
    ]);
    act(() =>
      result.current.replaceReadyId(result.current.items[1], 'renewed-ready'),
    );
    expect(result.current.readyIds).toEqual(['renewed-ready']);
  });

  it('old upload completions cannot release the new generation queue slots', async () => {
    const { result, pending, upload } = setup();
    act(() => result.current.addFiles([photo('old.jpg')]));
    act(() => result.current.clear());
    act(() =>
      result.current
        .beginSelection()
        .commit(Array.from({ length: 5 }, (_, i) => photo(`new-${i}.jpg`))),
    );
    expect(upload).toHaveBeenCalledTimes(4); // One old, three new.
    await act(async () => {
      pending[0].resolve({ attachmentId: 'old-ready' });
      await pending[0].promise;
    });
    expect(upload).toHaveBeenCalledTimes(4);
    await act(async () => {
      pending[1].resolve({ attachmentId: 'new-ready' });
      await pending[1].promise;
    });
    expect(upload).toHaveBeenCalledTimes(5);
    expect(result.current.readyIds).toEqual(['new-ready']);
  });
});
