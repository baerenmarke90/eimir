// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getByText(between('5–10 km'))).toBeTruthy();
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

  it('leads the viewer to the settings when their own location is missing', () => {
    show({ kind: 'ownMissing' });
    expect(
      screen
        .getByRole('link', { name: copy.distanceOwnMissingLabel })
        .getAttribute('href'),
    ).toBe('/more/settings/relationship/location');
  });
});
