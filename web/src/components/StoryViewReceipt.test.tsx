// @vitest-environment jsdom
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from '../client/referenceFlow';
import { useStoryViewReceipt } from '../client/storyViewReceipt';

describe('Story View Receipt', () => {
  let apis: ReferenceApis;
  let recordStoryViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recordStoryViewMock = vi.fn().mockResolvedValue(undefined);
    apis = {
      story: { recordStoryView: recordStoryViewMock },
    } as unknown as ReferenceApis;
  });

  it('emits one receipt upon successful presentation', () => {
    const { rerender } = renderHook(
      ({ presented }) =>
        useStoryViewReceipt({
          apis,
          spaceId: 's-1',
          kind: 'HEART_MOMENT',
          itemId: 'hm-1',
          presented,
        }),
      { initialProps: { presented: false } },
    );

    expect(recordStoryViewMock).not.toHaveBeenCalled();

    rerender({ presented: true });

    expect(recordStoryViewMock).toHaveBeenCalledTimes(1);
    expect(recordStoryViewMock).toHaveBeenCalledWith({
      spaceId: 's-1',
      storyViewReceipt: { kind: 'HEART_MOMENT', itemId: 'hm-1' },
    });
  });

  it('does not emit receipt on failed presentation', () => {
    renderHook(() =>
      useStoryViewReceipt({
        apis,
        spaceId: 's-1',
        kind: 'HEART_MOMENT',
        itemId: 'hm-1',
        presented: false,
      }),
    );

    expect(recordStoryViewMock).not.toHaveBeenCalled();
  });

  it('does not burst duplicate writes across rerenders or presentation toggles', () => {
    const { rerender } = renderHook(
      ({ presented }) =>
        useStoryViewReceipt({
          apis,
          spaceId: 's-1',
          kind: 'MEMORY',
          itemId: 'memory-1',
          presented,
        }),
      { initialProps: { presented: true } },
    );

    expect(recordStoryViewMock).toHaveBeenCalledTimes(1);

    rerender({ presented: true });
    rerender({ presented: false });
    rerender({ presented: true });

    expect(recordStoryViewMock).toHaveBeenCalledTimes(1);
  });

  it('keeps successfully presented detail content usable when the receipt write fails', async () => {
    recordStoryViewMock.mockRejectedValueOnce(new Error('offline'));

    function DetailHarness() {
      useStoryViewReceipt({
        apis,
        spaceId: 's-1',
        kind: 'MILESTONE',
        itemId: 'milestone-1',
        presented: true,
      });
      return <main>Presented milestone detail</main>;
    }

    render(<DetailHarness />);

    expect(screen.getByText('Presented milestone detail')).toBeTruthy();
    await waitFor(() => expect(recordStoryViewMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Presented milestone detail')).toBeTruthy();
  });
});
