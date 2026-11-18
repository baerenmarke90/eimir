// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PartnerDistanceLine as Line } from '../client/partnerDistance';
import copy from '../i18n/locales/partnerLocation';
import { PartnerDistanceLine } from './PartnerDistanceLine';

const now = new Date(2026, 10, 13, 12, 0);
const between = (distance: string) =>
  copy.distanceBetween.replace('{{distance}}', distance);

function show(line: Line) {
  return render(
    <MemoryRouter>
      <PartnerDistanceLine line={line} partnerName="Alex" now={now} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('PartnerDistanceLine', () => {
  it('shows the sharer a status chip without any partner distance', () => {
    show({ kind: 'sharing' });
    const text = copy.distanceSharing.replace('{{partner}}', 'Alex');
    const link = screen.getByRole('link', {
      name: copy.distanceSharingLabel.replace('{{partner}}', 'Alex'),
    });
    expect(link.getAttribute('href')).toBe(
      '/more/settings/relationship/location',
    );
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText(/km/)).toBeNull();
  });

  it('renders nothing, not even a placeholder, when unavailable', () => {
    const { container } = show({ kind: 'hidden' });
    expect(container.innerHTML).toBe('');
  });

  it('links a current value to the map only when the partner shares it', () => {
    show({
      kind: 'distance',
      band: { kind: 'APPROXIMATE', approximateKm: 340 },
      asOf: new Date(2026, 10, 13, 11, 20),
      mapAvailable: true,
    });
    const link = screen.getByRole('link', {
      name: `${between('340 km')}. ${copy.distanceOpenMap}`,
    });
    expect(link.getAttribute('href')).toBe('/today/where-we-are');
    // A current value carries no freshness hint.
    expect(screen.queryByText(/heute/)).toBeNull();
    cleanup();

    show({
      kind: 'distance',
      band: { kind: 'RANGE', minKm: 5, maxKm: 10 },
      asOf: new Date(2026, 10, 13, 11, 20),
      mapAvailable: false,
    });
    expect(screen.queryByRole('link')).toBeNull();
    // A range band is put into words, never into a numeric range (#1907 H4).
    expect(screen.getByText(copy.distanceStonesThrow)).toBeTruthy();
    expect(screen.queryByText(/km/)).toBeNull();
  });

  it('keeps the distance pin for an earlier value in the Verbunden hero', () => {
    render(
      <MemoryRouter>
        <PartnerDistanceLine
          line={{
            kind: 'distance',
            band: { kind: 'APPROXIMATE', approximateKm: 340 },
            asOf: new Date(2026, 10, 12, 18, 1),
            mapAvailable: true,
          }}
          partnerName="Alex"
          now={new Date(2026, 10, 13, 0, 27)}
          compact
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link.querySelector('.partner-distance-glyph.is-pin')).not.toBeNull();
    expect(link.querySelector('.partner-distance-glyph.is-clock')).toBeNull();
    // The earlier state stays in the accessible name.
    expect(link.getAttribute('aria-label')).toMatch(/gestern/);
  });

  it('describes every range band in words, short in the Verbunden hero', () => {
    const bands = [
      [2, 5, copy.distanceAroundCorner, copy.distanceAroundCornerShort],
      [5, 10, copy.distanceStonesThrow, copy.distanceStonesThrowShort],
      [10, 25, copy.distanceNotFar, copy.distanceNotFarShort],
      [25, 50, copy.distanceShortTrip, copy.distanceShortTripShort],
    ] as const;
    for (const [minKm, maxKm, sentence, short] of bands) {
      const line = {
        kind: 'distance' as const,
        band: { kind: 'RANGE' as const, minKm, maxKm },
        asOf: new Date(2026, 10, 13, 11, 20),
        mapAvailable: true,
      };
      show(line);
      expect(
        screen.getByRole('link', {
          name: `${sentence}. ${copy.distanceOpenMap}`,
        }),
      ).toBeTruthy();
      cleanup();
      render(
        <MemoryRouter>
          <PartnerDistanceLine
            line={line}
            partnerName="Alex"
            now={new Date(2026, 10, 13, 12, 0)}
            compact
          />
        </MemoryRouter>,
      );
      const compact = screen.getByRole('link', {
        name: `${sentence}. ${copy.distanceOpenMap}`,
      });
      expect(compact.textContent).toBe(short);
      expect(
        compact.querySelector('.partner-distance-glyph.is-pin'),
      ).not.toBeNull();
      cleanup();
    }
  });

  it('never shows a number when nearby', () => {
    show({
      kind: 'distance',
      band: { kind: 'NEARBY' },
      asOf: new Date(2026, 10, 13, 11, 50),
      mapAvailable: false,
    });
    expect(screen.getByText(copy.distanceNear)).toBeTruthy();
    expect(screen.queryByText(/km/)).toBeNull();
  });

  it('presents older values calmly with their sample time, never as live', () => {
    const { container } = show({
      kind: 'distance',
      band: { kind: 'APPROXIMATE', approximateKm: 340 },
      asOf: new Date(2026, 10, 12, 21, 15),
      mapAvailable: false,
    });
    expect(container.querySelector('.is-earlier')).not.toBeNull();
    expect(
      screen.getByText(`${between('340 km')}, Stand gestern, 21:15`),
    ).toBeTruthy();
  });

  describe('on the Wir hero axis', () => {
    const lineFor = (approximateKm: number, asOf: Date): Line => ({
      kind: 'distance',
      band: { kind: 'APPROXIMATE', approximateKm },
      asOf,
      mapAvailable: true,
    });
    const hero = (line: Line) => (
      <MemoryRouter>
        <PartnerDistanceLine line={line} partnerName="Alex" now={now} compact />
      </MemoryRouter>
    );

    it('marks a current position as fresh and an earlier one as not', () => {
      const { container, rerender } = render(
        hero(lineFor(340, new Date(2026, 10, 13, 11, 50))),
      );
      expect(
        container.querySelector('.wir-hero-distance.is-fresh'),
      ).not.toBeNull();
      expect(container.querySelector('.is-earlier')).toBeNull();
      rerender(hero(lineFor(340, new Date(2026, 10, 12, 21, 15))));
      expect(
        container.querySelector('.wir-hero-distance.is-earlier'),
      ).not.toBeNull();
      expect(container.querySelector('.is-fresh')).toBeNull();
    });

    it('shows the first value without a swap animation', () => {
      const { container } = render(
        hero(lineFor(340, new Date(2026, 10, 13, 11, 50))),
      );
      expect(container.querySelector('.is-arriving')).toBeNull();
      expect(container.querySelector('.wir-hero-distance-leaving')).toBeNull();
    });

    it('fades a changed value over and then drops the leaving copy', () => {
      const asOf = new Date(2026, 10, 13, 11, 50);
      const { container, rerender } = render(hero(lineFor(340, asOf)));
      // The same value again is not a change.
      rerender(hero(lineFor(340, asOf)));
      expect(container.querySelector('.wir-hero-distance-leaving')).toBeNull();

      rerender(hero(lineFor(520, asOf)));
      const value = container.querySelector('.wir-hero-distance-value');
      const leaving = container.querySelector('.wir-hero-distance-leaving');
      const arriving = container.querySelector('.is-arriving');
      expect(leaving?.textContent).toBe('340 km');
      expect(arriving?.textContent).toBe('520 km');
      // Both copies are decorative; the link keeps its accessible name.
      expect(value?.getAttribute('aria-hidden')).toBe('true');
      expect(
        screen.getByRole('link', {
          name: `${between('520 km')}. ${copy.distanceOpenMap}`,
        }),
      ).toBeTruthy();

      // jsdom has no AnimationEvent, so React listens for the prefixed name.
      fireEvent(
        leaving as Element,
        new Event('webkitAnimationEnd', { bubbles: true }),
      );
      expect(container.querySelector('.wir-hero-distance-leaving')).toBeNull();
      expect(container.querySelector('.is-arriving')?.textContent).toBe(
        '520 km',
      );
    });
  });

  it('leads the viewer to the settings when their own location is missing', () => {
    show({ kind: 'ownMissing' });
    expect(
      screen
        .getByRole('link', { name: copy.distanceOwnMissingLabel })
        .getAttribute('href'),
    ).toBe('/more/settings/relationship/location');
  });
});
