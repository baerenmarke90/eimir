import { personInitials } from './PersonIdentity';

describe('personInitials', () => {
  it('uses first and last name for a multi-part name', () => {
    expect(personInitials('Anna Maria Beispiel')).toBe('AB');
  });

  it('uses two unicode characters for a single-part name', () => {
    expect(personInitials('李雷')).toBe('李雷');
  });

  it('tracks the current trimmed display name', () => {
    expect(personInitials('  Änne   Reis  ')).toBe('ÄR');
  });

  it('has a deterministic empty fallback', () => {
    expect(personInitials('   ')).toBe('?');
  });
});
