import { describe, expect, it } from 'vitest';
import { photoShape } from './photoShape';

describe('photoShape', () => {
  it('reads portrait, landscape and square from the dimensions', () => {
    expect(photoShape({ width: 3000, height: 4000 })).toBe('portrait');
    expect(photoShape({ width: 4000, height: 3000 })).toBe('landscape');
    expect(photoShape({ width: 3000, height: 3000 })).toBe('square');
    expect(photoShape({ width: 1000, height: 1050 })).toBe('square');
  });

  it('falls back to landscape when dimensions are missing', () => {
    expect(photoShape(undefined)).toBe('landscape');
    expect(photoShape(null)).toBe('landscape');
    expect(photoShape({ width: null, height: 3000 })).toBe('landscape');
    expect(photoShape({ width: 0, height: 0 })).toBe('landscape');
  });
});
