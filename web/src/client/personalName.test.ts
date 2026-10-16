import { describe, expect, it } from 'vitest';
import { firstNameFromDisplayName } from './personalName';

describe('firstNameFromDisplayName', () => {
  it('uses only the first token of a full display name', () => {
    expect(firstNameFromDisplayName('Lea Winters', 'Du')).toBe('Lea');
    expect(firstNameFromDisplayName('  Alex   Winter  ', 'Du')).toBe('Alex');
  });

  it('keeps an existing single-name display name unchanged', () => {
    expect(firstNameFromDisplayName('Lea', 'Du')).toBe('Lea');
  });

  it('uses the privacy-safe fallback when the display name is empty', () => {
    expect(firstNameFromDisplayName('   ', 'Du')).toBe('Du');
    expect(firstNameFromDisplayName(undefined, 'Dein Partner')).toBe(
      'Dein Partner',
    );
  });
});
