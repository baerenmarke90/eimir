import { manualPlace, placeMapsUrl } from './photoLocations';

describe('photo place map links', () => {
  it('opens the precise saved pin without an API key or external request', () => {
    const url = new URL(
      placeMapsUrl({ name: 'Photo location', latitude: 52.5, longitude: 13.4 }),
    );
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('query')).toBe('52.5,13.4');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.has('key')).toBe(false);
  });

  it('supports ordinary shared short links without resolving them', () => {
    const result = manualPlace(
      'Our café',
      'https://maps.app.goo.gl/Example123',
    );
    expect(result).toEqual({
      name: 'Our café',
      mapUrl: 'https://maps.app.goo.gl/Example123',
    });
    expect(placeMapsUrl(result)).toBe(result.mapUrl);
  });

  it('uses an explicit query pin but never mistakes the viewport center for a place', () => {
    expect(
      manualPlace(
        'Our spot',
        'https://www.google.com/maps/search/?api=1&query=52.5,13.4',
      ),
    ).toMatchObject({ latitude: 52.5, longitude: 13.4 });
    const viewport = manualPlace(
      'Our spot',
      'https://www.google.com/maps/@52.5,13.4,15z',
    );
    expect(viewport.latitude).toBeUndefined();
    expect(viewport.mapUrl).toBeDefined();
  });

  it.each([
    'https://www.google.com.evil.test/maps/a',
    'http://www.google.com/maps/a',
    'https://user:password@www.google.com/maps/a',
    'https://www.google.com:8443/maps/a',
    'https://example.org/maps/a',
    '91, 13',
  ])('rejects misleading or invalid input: %s', (value) => {
    expect(() => manualPlace('A place', value)).toThrow();
  });

  it('keeps meaningful names and addresses without inventing coordinates', () => {
    expect(manualPlace('Our favourite place', '')).toEqual({
      name: 'Our favourite place',
    });
    expect(manualPlace('Our café', 'Market Street 1')).toEqual({
      name: 'Our café',
      address: 'Market Street 1',
    });
  });
});
