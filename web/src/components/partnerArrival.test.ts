// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arrivalMode,
  holdPositions,
  startPartnerArrival,
} from './partnerArrival';

describe('arrival planning', () => {
  it('travels unless exactly one battery or note arrives', () => {
    expect(arrivalMode(['vibe'])).toBe('travel');
    expect(arrivalMode(['vibe', 'energy', 'note'])).toBe('travel');
    expect(arrivalMode(['energy', 'note'])).toBe('travel');
    expect(arrivalMode(['energy'])).toBe('settle');
    expect(arrivalMode(['note'])).toBe('settle');
  });

  it('puts the feeling on top and the others below, side by side', () => {
    const all = holdPositions(['vibe', 'energy', 'note']);
    expect(all.vibe.y).toBeLessThan(all.energy.y);
    expect(all.energy.x).toBeLessThan(0);
    expect(all.note.x).toBeGreaterThan(0);
    const two = holdPositions(['vibe', 'note']);
    expect(two.note.x).toBe(0);
    const bare = holdPositions(['energy', 'note']);
    expect(bare.energy.y).toBe(bare.note.y);
  });
});

describe('startPartnerArrival', () => {
  const rect = {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 50,
    bottom: 50,
    width: 40,
    height: 40,
    toJSON: () => ({}),
  };
  const roles = {
    '--duration-context': '280ms',
    '--duration-send-flight': '560ms',
    '--duration-gesture-moment': '900ms',
    '--duration-feedback': '120ms',
    '--easing-enter': 'cubic-bezier(0, 0, 0.2, 1)',
    '--easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  };

  function badgeWith(...kinds: string[]) {
    const avatar = document.createElement('span');
    const badge = document.createElement('span');
    for (const kind of kinds) {
      const slot = document.createElement('span');
      slot.setAttribute('data-flight-slot', kind);
      slot.innerHTML = '<svg></svg>';
      badge.append(slot);
    }
    avatar.append(badge);
    document.body.append(avatar);
    const slotOf = (kind: string) =>
      badge.querySelector(`[data-flight-slot="${kind}"]`);
    return { avatar, badge, slotOf };
  }

  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      rect as never,
    );
    Object.assign(HTMLElement.prototype, {
      animate: vi.fn(() => ({
        finished: Promise.resolve(),
        cancel: vi.fn(),
      })),
      showPopover: vi.fn(),
      hidePopover: vi.fn(),
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false }),
    });
    for (const [name, value] of Object.entries(roles))
      document.documentElement.style.setProperty(name, value);
  });
  afterEach(() => {
    for (const name of Object.keys(roles))
      document.documentElement.style.removeProperty(name);
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    delete proto.animate;
    delete proto.showPopover;
    delete proto.hidePopover;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('is not started without items, a badge or motion support', () => {
    const { avatar, badge, slotOf } = badgeWith('vibe');
    const item = { kind: 'vibe' as const, slot: () => slotOf('vibe') };
    expect(
      startPartnerArrival({ avatar, badge, items: [] }, { onLand: vi.fn() }),
    ).toBeNull();
    expect(
      startPartnerArrival(
        { avatar, badge: null, items: [item] },
        { onLand: vi.fn() },
      ),
    ).toBeNull();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true }),
    });
    expect(
      startPartnerArrival(
        { avatar, badge, items: [item] },
        { onLand: vi.fn() },
      ),
    ).toBeNull();
  });

  it('lifts every value out of the avatar together and lands each in its slot', async () => {
    const { avatar, badge, slotOf } = badgeWith('vibe', 'energy');
    const landed: string[] = [];
    const arrival = startPartnerArrival(
      {
        avatar,
        badge,
        items: [
          { kind: 'vibe', slot: () => slotOf('vibe') },
          { kind: 'energy', slot: () => slotOf('energy') },
        ],
      },
      { onLand: (kind) => landed.push(kind) },
    );
    expect(arrival).not.toBeNull();
    const layer = document.querySelector('[popover="manual"]');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.querySelectorAll('.is-arrival')).toHaveLength(2);
    await arrival?.done;
    expect(landed.sort()).toEqual(['energy', 'vibe']);
    expect(document.querySelector('[popover]')).toBeNull();
  });

  it('shrinks the old feeling away and never copies its glyph', async () => {
    const { avatar, badge, slotOf } = badgeWith('vibe');
    const slot = slotOf('vibe') as HTMLElement;
    const farewell = document.createElement('span');
    farewell.setAttribute('data-flight-farewell', 'true');
    farewell.innerHTML = '<svg data-old></svg>';
    slot.append(farewell);
    const farewellAnimate = vi.fn(() => ({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    }));
    farewell.animate = farewellAnimate as never;
    const arrival = startPartnerArrival(
      { avatar, badge, items: [{ kind: 'vibe', slot: () => slot }] },
      { onLand: vi.fn() },
    );
    const ghost = document.querySelector('.is-arrival');
    // The travelling glyph is the slot's own, not the farewelling one.
    expect(ghost?.querySelector('[data-old]')).toBeNull();
    expect(ghost?.querySelector('svg')).not.toBeNull();
    await Promise.resolve();
    expect(farewellAnimate).toHaveBeenCalledTimes(1);
    await arrival?.done;
  });

  it('only settles a single battery in place, without flying elements', async () => {
    const { avatar, badge, slotOf } = badgeWith('energy');
    const landed: string[] = [];
    const arrival = startPartnerArrival(
      {
        avatar,
        badge,
        items: [{ kind: 'energy', slot: () => slotOf('energy') }],
      },
      { onLand: (kind) => landed.push(kind) },
    );
    expect(document.querySelectorAll('.is-arrival')).toHaveLength(0);
    await arrival?.done;
    expect(landed).toEqual([]);
    expect(document.querySelector('[popover]')).toBeNull();
  });

  it('drops everything when cancelled', () => {
    const { avatar, badge, slotOf } = badgeWith('vibe');
    const arrival = startPartnerArrival(
      {
        avatar,
        badge,
        items: [{ kind: 'vibe', slot: () => slotOf('vibe') }],
      },
      { onLand: vi.fn() },
    );
    arrival?.cancel();
    expect(document.querySelector('[popover]')).toBeNull();
  });
});
