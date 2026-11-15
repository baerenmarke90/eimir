// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import type { ReferenceApis } from './referenceFlow';
import { useOrderedPhotoDrafts } from './useOrderedPhotoDrafts';

afterEach(cleanup);
const options = {
  apiBaseUrl: 'https://example.test',
  accountId: 'owner',
  spaceId: 'space',
  accessToken: 'test-token',
  apis: {} as ReferenceApis,
};
const photos = ['first', 'second', 'third'].map((id, position) => ({
  id,
  position,
  status: 'READY',
  mediaType: 'IMAGE',
  isSensitive: position === 1,
})) as OrderedAttachmentSummary[];

it('preserves a nonfirst explicit cover through absolute and relative reorder; removing it restores automatic mode', () => {
  const { result } = renderHook(() => useOrderedPhotoDrafts(options));
  act(() => result.current.load(photos, 'second'));
  act(() =>
    result.current.reorder(['saved:third', 'saved:first', 'saved:second']),
  );
  expect(result.current.entries.map((item) => item.attachmentId)).toEqual([
    'third',
    'first',
    'second',
  ]);
  expect(result.current.selectedCoverAttachmentId).toBe('second');
  expect(result.current.entries[2].isSensitive).toBe(true);
  act(() => result.current.move('saved:second', -1));
  expect(result.current.selectedCoverAttachmentId).toBe('second');
  act(() =>
    result.current.remove(
      result.current.items.find((item) => item.existing?.id === 'second')!,
    ),
  );
  expect(result.current.selectedCoverAttachmentId).toBeNull();
  expect(result.current.selectedCoverKey).toBeNull();
});

it('clears media and cover across an account scope change', () => {
  const { result, rerender } = renderHook(
    ({ accountId }) => useOrderedPhotoDrafts({ ...options, accountId }),
    { initialProps: { accountId: 'owner' } },
  );
  act(() => result.current.load(photos, 'second'));
  rerender({ accountId: 'partner' });
  expect(result.current.items).toEqual([]);
  expect(result.current.selectedCoverAttachmentId).toBeNull();
});
