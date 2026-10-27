import { photoPlaceMapUrl } from './photoPlaces';
import { taskOriginPath } from './taskOrigin';

it('does not create map destinations for missing or invalid coordinates', () => {
  for (const [lat, lon] of [
    [null, 1],
    [1, null],
    [Infinity, 1],
    [91, 0],
    [0, -181],
    [NaN, 0],
  ]) {
    expect(photoPlaceMapUrl(lat, lon)).toBeNull();
  }
  expect(photoPlaceMapUrl(-90, 180)).toBe(
    'https://www.google.com/maps/search/?api=1&query=-90%2C180',
  );
});

it('returns from canonical Place detail only to the read moment, without sensitive queries or editor paths', () => {
  expect(taskOriginPath('/story/memories/m', '?secret=text')).toBe(
    '/story/memories/m',
  );
  expect(taskOriginPath('/story/heart-moments/h', '')).toBe(
    '/story/heart-moments/h',
  );
  expect(taskOriginPath('/story/memories/m/edit', '')).toBeNull();
  expect(taskOriginPath('/story/memories/new', '')).toBeNull();
});
