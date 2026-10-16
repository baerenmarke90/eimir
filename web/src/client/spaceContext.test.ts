import type { AccountMembershipView } from '../api/generated/models/AccountMembershipView';
import { resolveActiveSpaceId } from './spaceContext';

function membership(spaceId: string): AccountMembershipView {
  return { spaceId, role: 'PARTNER', status: 'ACTIVE' };
}

describe('authorized Space context', () => {
  it('enters directly when exactly one server-authorized Space exists', () => {
    expect(resolveActiveSpaceId([membership('space-a')], null)).toBe('space-a');
  });

  it('requires an explicit choice when multiple authorized Spaces exist', () => {
    expect(
      resolveActiveSpaceId(
        [membership('space-a'), membership('space-b')],
        null,
      ),
    ).toBeNull();
  });

  it('keeps the current Space while it remains authorized', () => {
    expect(
      resolveActiveSpaceId(
        [membership('space-a'), membership('space-b')],
        'space-b',
      ),
    ).toBe('space-b');
  });

  it('drops stale client state and never returns an unauthorized Space', () => {
    expect(resolveActiveSpaceId([membership('space-a')], 'space-removed')).toBe(
      'space-a',
    );
    expect(
      resolveActiveSpaceId(
        [membership('space-a'), membership('space-b')],
        'space-removed',
      ),
    ).toBeNull();
    expect(resolveActiveSpaceId([], 'space-removed')).toBeNull();
  });
});
