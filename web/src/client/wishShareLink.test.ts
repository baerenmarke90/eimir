import { describe, expect, it } from 'vitest';
import { wishShareUrl } from './wishShareLink';

describe('wishShareUrl', () => {
  it('joins the origin and the canonical Wish path', () => {
    expect(wishShareUrl('https://app.example.org', 'abc-123')).toBe(
      'https://app.example.org/plan/wishes/abc-123',
    );
  });

  it('strips trailing slashes and whitespace from the origin', () => {
    expect(wishShareUrl(' https://app.example.org// ', 'abc')).toBe(
      'https://app.example.org/plan/wishes/abc',
    );
  });

  it('encodes the id and carries no query, hash or other content', () => {
    const url = wishShareUrl('https://app.example.org', 'a b/c?d#e');
    expect(url).toBe('https://app.example.org/plan/wishes/a%20b%2Fc%3Fd%23e');
    const parsed = new URL(url);
    expect(parsed.search).toBe('');
    expect(parsed.hash).toBe('');
  });
});
