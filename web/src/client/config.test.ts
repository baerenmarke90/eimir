import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './config';

describe('API base URL resolution', () => {
  it('uses configured API base URL when provided', () => {
    expect(
      resolveApiBaseUrl('https://api.example.com/', 'https://localhost', false),
    ).toBe('https://api.example.com');
    expect(
      resolveApiBaseUrl('https://api.example.com/', 'https://localhost', true),
    ).toBe('https://api.example.com');
  });

  it('falls back to window origin in browser environments', () => {
    expect(resolveApiBaseUrl('', 'https://app.eimir.test', false)).toBe(
      'https://app.eimir.test',
    );
  });

  it('fails closed in native Capacitor environments when API base URL is missing', () => {
    expect(() => resolveApiBaseUrl('', 'https://localhost', true)).toThrowError(
      /Capacitor native container requires an explicit API base URL/,
    );
  });
});
