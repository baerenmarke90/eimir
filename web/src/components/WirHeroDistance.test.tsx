// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartnerDistanceLine as Line } from '../client/partnerDistance';
import {
  clearWirDistanceSeen,
  DISTANCE_CHANGE_REST_MS,
  readDistanceSeen,
  rememberDistanceSeen,
} from '../client/wirDistanceSeen';
import copy from '../i18n/locales/partnerLocation';
import { resetAttentionForTests } from '../motion/attention';
import { useWirDistanceRead } from './PartnerDistanceLine';
import {
  useWirHeroDistance,
  WIR_DISTANCE_WORD_MS,
  WirBridgeHeart,
  WirDistanceLight,
  WirDistanceTell,
} from './WirHeroDistance';

vi.mock('./PartnerDistanceLine', async (original) => ({
  ...(await original<typeof import('./PartnerDistanceLine')>()),
  useWirDistanceRead: vi.fn(),
}));

let openingPhase = 'ended';
vi.mock('../motion/stage', async (original) => ({
  ...(await original<typeof import('../motion/stage')>()),
  useStagePhase: () => openingPhase,
}));

const NOW = new Date(2026, 10, 22, 12, 0);
const read = vi.mocked(useWirDistanceRead);

const near: Line = {
  kind: 'distance',
  band: { kind: 'NEARBY' },
  asOf: new Date(NOW.getTime() - 60_000),
  mapAvailable: false,
};
const stonesThrow: Line = {
  kind: 'distance',
  band: { kind: 'RANGE', minKm: 5, maxKm: 10 },
  asOf: new Date(NOW.getTime() - 60_000),
  mapAvailable: true,
};
const far: Line = {
  kind: 'distance',
  band: { kind: 'APPROXIMATE', approximateKm: 340 },
  asOf: new Date(NOW.getTime() - 60_000),
  mapAvailable: false,
};

function Hero({ occasion = false }: { occasion?: boolean }) {
  const signal = useWirHeroDistance({
    api: undefined,
    entitlementApi: undefined,
    accountId: 'account',
    spaceId: 'space',
    enabled: true,
    occasion,
  });
  return (
    <div className="wir-stage">
      <span className="wir-bridge-slot" data-testid="slot">
        {signal ? <WirDistanceTell signal={signal} /> : null}
      </span>
      <span data-testid="closeness">{String(signal?.closeness)}</span>
    </div>
  );
}

const hero = (occasion = false) => (
  <MemoryRouter>
    <Hero occasion={occasion} />
  </MemoryRouter>
);
const word = () => document.querySelector('.wir-distance-word');
const closeness = () => screen.getByTestId('closeness').textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  clearWirDistanceSeen();
  resetAttentionForTests();
  openingPhase = 'ended';
  read.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the distance in the Verbunden hero', () => {
  it('shows the first value without any word or motion', () => {
    read.mockReturnValue(stonesThrow);
    render(hero());
    expect(word()).toBeNull();
    expect(closeness()).toBe(String(2 / 6));
    expect(readDistanceSeen('account', 'space')?.stage).toBe(2);
  });

  it('shows the word on a tap and returns to the time after the dwell', () => {
    read.mockReturnValue(stonesThrow);
    render(hero());
    fireEvent.click(
      screen.getByRole('button', { name: copy.distanceStonesThrow }),
      { detail: 1 },
    );
    const link = screen.getByRole('link', {
      name: `${copy.distanceStonesThrow}. ${copy.distanceOpenMap}`,
    });
    expect(link.textContent).toBe(copy.distanceStonesThrowShort);
    expect(link.getAttribute('href')).toBe('/today/where-we-are');
    expect(screen.getByTestId('slot')).toBeTruthy();
    act(() => vi.advanceTimersByTime(WIR_DISTANCE_WORD_MS));
    expect(word()).toBeNull();
  });

  it('keeps the word for keyboard use until focus leaves it', () => {
    read.mockReturnValue(stonesThrow);
    render(hero());
    const heart = screen.getByRole('button', {
      name: copy.distanceStonesThrow,
    });
    heart.focus();
    fireEvent.click(heart, { detail: 0 });
    act(() => vi.advanceTimersByTime(WIR_DISTANCE_WORD_MS * 2));
    expect(word()).not.toBeNull();
    fireEvent.blur(heart);
    act(() => vi.advanceTimersByTime(WIR_DISTANCE_WORD_MS));
    expect(word()).toBeNull();
  });

  it('shows a changed distance once when the app opens', () => {
    rememberDistanceSeen('account', 'space', 5);
    read.mockReturnValue(stonesThrow);
    openingPhase = 'playing';
    const { rerender } = render(hero());
    // The old state stays until the opening has ended.
    expect(closeness()).toBe(String(5 / 6));
    expect(word()).toBeNull();
    openingPhase = 'ended';
    rerender(hero());
    expect(closeness()).toBe(String(2 / 6));
    expect(word()?.textContent).toBe(copy.distanceStonesThrowShort);
    expect(screen.getByRole('status').textContent).toBe(
      copy.distanceStonesThrow,
    );
    const seen = readDistanceSeen('account', 'space');
    expect(seen?.stage).toBe(2);
    expect(seen?.playedAt).toBe(NOW.getTime());

    act(() => vi.advanceTimersByTime(WIR_DISTANCE_WORD_MS));
    cleanup();
    resetAttentionForTests();
    render(hero());
    expect(word()).toBeNull();
  });

  it('moves quietly when a value flips within the rest period', () => {
    rememberDistanceSeen('account', 'space', 5, { played: true });
    vi.setSystemTime(NOW.getTime() + DISTANCE_CHANGE_REST_MS - 1);
    read.mockReturnValue({
      ...stonesThrow,
      asOf: new Date(NOW.getTime() + DISTANCE_CHANGE_REST_MS - 60_000),
    });
    render(hero());
    expect(word()).toBeNull();
    expect(closeness()).toBe(String(2 / 6));
    expect(readDistanceSeen('account', 'space')?.stage).toBe(2);
  });

  it('leaves an important day to its own Moment', () => {
    rememberDistanceSeen('account', 'space', 5);
    read.mockReturnValue(near);
    render(hero(true));
    expect(word()).toBeNull();
    expect(closeness()).toBe('0');
  });

  it('never presents an earlier value as a live change', () => {
    rememberDistanceSeen('account', 'space', 0);
    read.mockReturnValue({
      ...far,
      asOf: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
    });
    render(hero());
    expect(word()).toBeNull();
    expect(closeness()).toBe(String(5 / 6));
    expect(readDistanceSeen('account', 'space')?.stage).toBe(0);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain(
      'Stand',
    );
  });

  it('forgets the step when sharing ends and offers nothing', () => {
    rememberDistanceSeen('account', 'space', 3);
    read.mockReturnValue({ kind: 'sharing' });
    render(hero());
    expect(readDistanceSeen('account', 'space')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('leads to the settings when the own location is missing', () => {
    rememberDistanceSeen('account', 'space', 3);
    read.mockReturnValue({ kind: 'ownMissing' });
    render(hero());
    expect(readDistanceSeen('account', 'space')?.stage).toBe(3);
    fireEvent.click(
      screen.getByRole('button', { name: copy.distanceOwnMissingLabel }),
      { detail: 1 },
    );
    expect(
      screen
        .getByRole('link', { name: copy.distanceOwnMissingLabel })
        .getAttribute('href'),
    ).toBe('/more/settings/relationship/location');
  });
});

describe('the heart and the light', () => {
  it('fills the heart completely at the closest step', () => {
    const { container } = render(
      <WirBridgeHeart occasion={false} closeness={0} earlier={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.style.getPropertyValue('--wir-distance-closeness')).toBe('0');
    const shadow = container.querySelector('.wir-bridge-moon-shadow');
    const left =
      Number(shadow?.getAttribute('cx')) - Number(shadow?.getAttribute('r'));
    // The shadow starts beyond the heart's right edge (x = 31).
    expect(left).toBeGreaterThan(31);
  });

  it('draws only the outline without a distance', () => {
    const { container } = render(
      <WirBridgeHeart occasion={false} closeness={null} earlier={false} />,
    );
    expect(container.querySelector('.wir-bridge-moon')).toBeNull();
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('marks an earlier value and keeps the light decorative', () => {
    const { container } = render(
      <>
        <WirBridgeHeart occasion={false} closeness={0.5} earlier />
        <WirDistanceLight closeness={0.5} />
      </>,
    );
    expect(container.querySelector('.wir-bridge-moon.is-earlier')).toBeTruthy();
    expect(
      container
        .querySelector('.wir-distance-light')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });
});
