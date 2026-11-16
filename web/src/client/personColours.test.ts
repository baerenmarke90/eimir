import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSON_COLOUR_PAIR,
  PERSON_COLOUR_PAIRS,
  personColourPair,
  personColourVariables,
  personRoleResolver,
  roleOrder,
} from './personColours';

describe('personRoleResolver', () => {
  it('gives the signed-in account the own role and everybody else the partner role', () => {
    const roleOf = personRoleResolver('anna');
    expect(roleOf('anna')).toBe('own');
    expect(roleOf('ben')).toBe('partner');
  });

  it('treats an unknown or missing person as the partner, never as the viewer', () => {
    expect(personRoleResolver('anna')(null)).toBe('partner');
    expect(personRoleResolver('anna')(undefined)).toBe('partner');
    expect(personRoleResolver(undefined)('anna')).toBe('partner');
  });

  it('orders you before your partner', () => {
    expect(roleOrder('own')).toBeLessThan(roleOrder('partner'));
  });
});

describe('colour pairs', () => {
  it('keeps the blue and rose default until someone chooses', () => {
    expect(personColourPair(null)).toEqual({ own: 'blue', partner: 'rose' });
    expect(personColourPair(undefined)).toEqual(DEFAULT_PERSON_COLOUR_PAIR);
  });

  it('reads own colour first and the partner colour second', () => {
    expect(personColourPair('rose_deeprose')).toEqual({
      own: 'rose',
      partner: 'deeprose',
    });
    expect(personColourPair('moss_blue')).toEqual({
      own: 'moss',
      partner: 'blue',
    });
  });

  it('never offers two people the same colour', () => {
    for (const id of PERSON_COLOUR_PAIRS) {
      const pair = personColourPair(id);
      expect(pair.own).not.toBe(pair.partner);
    }
  });

  it('points the role variables at the generated person tokens', () => {
    expect(personColourVariables({ own: 'deepblue', partner: 'blue' })).toEqual(
      {
        '--person-own-accent': 'var(--color-person-deepblue)',
        '--person-own-surface': 'var(--color-person-deepblue-surface)',
        '--person-partner-accent': 'var(--color-person-blue)',
        '--person-partner-surface': 'var(--color-person-blue-surface)',
      },
    );
  });
});
