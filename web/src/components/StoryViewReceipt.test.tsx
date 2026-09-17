// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      { initialProps: { presented: false } }
    );

    // initially no receipt before presentation is true
    expect(recordStoryViewMock).not.toHaveBeenCalled();

    // toggle presentation to true
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
      })
    );

    expect(recordStoryViewMock).not.toHaveBeenCalled();
  });
});
