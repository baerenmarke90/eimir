// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, StrictMode, Suspense, startTransition } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from './referenceFlow';
import {
  type AttachmentDraftOptions,
  useAttachmentDrafts,
} from './useAttachmentDrafts';

describe('attachment selection during a suspended context transition (#1444)', () => {
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

  it('uses committed transport while the next Account and Space render is suspended', async () => {
    let resumeTransition!: () => void;
    const suspended = new Promise<void>((resolve) => {
      resumeTransition = resolve;
    });
    let allowNextContext = false;
    const uploadA = vi.fn<
      NonNullable<AttachmentDraftOptions['uploadAttachmentFn']>
    >(() => new Promise(() => {}));
    const uploadB = vi.fn<
      NonNullable<AttachmentDraftOptions['uploadAttachmentFn']>
    >(() => new Promise(() => {}));
    const initialProps: AttachmentDraftOptions = {
      apis: {} as ReferenceApis,
      apiBaseUrl: 'https://api-a.example.test',
      accessToken: 'synthetic-session-a',
      accountId: 'account-a',
      spaceId: 'space-a',
      uploadAttachmentFn: uploadA,
    };
    const nextProps: AttachmentDraftOptions = {
      ...initialProps,
      apis: {} as ReferenceApis,
      apiBaseUrl: 'https://api-b.example.test',
      accessToken: 'synthetic-session-b',
      accountId: 'account-b',
      spaceId: 'space-b',
      uploadAttachmentFn: uploadB,
    };
    const { result, rerender } = renderHook(
      (options: AttachmentDraftOptions) => {
        const drafts = useAttachmentDrafts(options);
        // Model a descendant suspending after this hook has rendered with
        // the next context, before any of that render's layout effects commit.
        if (options.spaceId === 'space-b' && !allowNextContext) throw suspended;
        return drafts;
      },
      {
        initialProps,
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>
            <Suspense fallback={null}>{children}</Suspense>
          </StrictMode>
        ),
      },
    );
    const completingSelection = result.current.beginSelection();
    const pendingSelection = result.current.beginSelection();

    act(() => {
      startTransition(() => rerender(nextProps));
    });
    expect(result.current.contextKey).toBe('account-a:space-a');
    expect(completingSelection.signal.aborted).toBe(false);

    const selected = new File(['synthetic image'], 'selected.jpg', {
      type: 'image/jpeg',
    });
    act(() => expect(completingSelection.commit([selected])).toBe(true));
    expect(uploadB).not.toHaveBeenCalled();
    expect(uploadA).toHaveBeenCalledTimes(1);
    expect(uploadA.mock.calls[0]?.slice(0, 5)).toEqual([
      initialProps.apis,
      initialProps.apiBaseUrl,
      initialProps.accessToken,
      initialProps.spaceId,
      selected,
    ]);

    await act(async () => {
      allowNextContext = true;
      resumeTransition();
      await suspended;
    });
    expect(result.current.contextKey).toBe('account-b:space-b');
    expect(result.current.items).toEqual([]);
    expect(pendingSelection.signal.aborted).toBe(true);
    act(() => expect(pendingSelection.commit([selected])).toBe(false));
    expect(uploadB).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
