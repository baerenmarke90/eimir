import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import {
  APPEARANCE_QUERY_ROOTS,
  refreshAppearanceSiblings,
} from './appearanceSiblings';

it('names every personal appearance choice that shares the version token', () => {
  expect([...APPEARANCE_QUERY_ROOTS].sort()).toEqual([
    'app-icon',
    'memory-world',
    'person-colours',
    'wir-design',
    'wir-reel-style',
  ]);
});

it('refreshes every other appearance choice after a save (#2345)', () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  refreshAppearanceSiblings(client, 'person-colours');
  const refreshed = invalidate.mock.calls.map(
    ([filters]) => filters?.queryKey?.[0],
  );
  expect(refreshed.sort()).toEqual([
    'app-icon',
    'memory-world',
    'wir-design',
    'wir-reel-style',
  ]);
});
