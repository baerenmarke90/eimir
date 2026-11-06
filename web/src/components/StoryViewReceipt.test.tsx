// @vitest-environment jsdom
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ReferenceApis } from '../client/referenceFlow';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import { dashboardQueryKey } from '../client/dashboardQueries';

describe('Story View Receipt', () => {
  let apis: ReferenceApis;
  let recordStoryViewMock: ReturnType<typeof vi.fn>;
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    recordStoryViewMock = vi.fn().mockResolvedValue(undefined);
    client = new QueryClient();
    client.setQueryData(dashboardQueryKey('s-1'), { incomingExperience: {} });
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
      { initialProps: { presented: false }, wrapper },
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
    renderHook(
      () =>
        useStoryViewReceipt({
          apis,
          spaceId: 's-1',
          kind: 'HEART_MOMENT',
          itemId: 'hm-1',
          presented: false,
        }),
      { wrapper },
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
      { initialProps: { presented: true }, wrapper },
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

    render(<DetailHarness />, { wrapper });

    expect(screen.getByText('Presented milestone detail')).toBeTruthy();
    await waitFor(() => expect(recordStoryViewMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Presented milestone detail')).toBeTruthy();
  });

  it('does not invalidate a replacement Dashboard after a late receipt', async () => {
    let resolve!: () => void;
    recordStoryViewMock.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderHook(
      () =>
        useStoryViewReceipt({
          apis,
          spaceId: 's-1',
          kind: 'MEMORY',
          itemId: 'memory-1',
          presented: true,
        }),
      { wrapper },
    );
    client.removeQueries({ queryKey: dashboardQueryKey('s-1') });
    client.setQueryData(dashboardQueryKey('s-1'), { incomingExperience: null });
    await act(async () => resolve());
    expect(invalidate).not.toHaveBeenCalled();
  });
});
