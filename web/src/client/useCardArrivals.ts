import { useEffect, useRef } from 'react';

/** How long after a Wir mount a new card still waits for the opening. */
const OPENING_WINDOW_MS = 1500;
const MAX_REMEMBERED = 300;

export type CardArrival = 'opening' | 'live';

function storageKey(scope: string) {
  return `eimir.wirCardsSeen.v1:${scope}`;
}

function readSeen(scope: string | null): Set<string> {
  if (!scope || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeSeen(scope: string, seen: ReadonlySet<string>) {
  if (typeof window === 'undefined') return;
  try {
    const recent = [...seen].slice(-MAX_REMEMBERED);
    window.localStorage.setItem(storageKey(scope), JSON.stringify(recent));
  } catch {
    // A device without storage shows each card's arrival once per visit.
  }
}

/**
 * Which cards this device sees for the first time (#2345 B, variant C).
 *
 * A card arrives once per device: on a Wir opening it waits for the opening
 * ('opening'), and a card that appears while Wir is open arrives at once
 * ('live'). Decided during render, so a new card never flashes in its final
 * state before its arrival starts; remembered afterwards, so a return to Wir
 * never replays it. Only ids are stored, never content.
 */
export function useCardArrivals(
  scope: string | null,
  ids: readonly string[],
): ReadonlyMap<string, CardArrival> {
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = readSeen(scope);
  const mountedAt = useRef<number | null>(null);
  if (mountedAt.current === null) mountedAt.current = Date.now();
  const arrivals = useRef(new Map<string, CardArrival>());

  for (const id of ids) {
    if (seen.current.has(id) || arrivals.current.has(id)) continue;
    arrivals.current.set(
      id,
      Date.now() - mountedAt.current < OPENING_WINDOW_MS ? 'opening' : 'live',
    );
  }

  const key = ids.join('\n');
  useEffect(() => {
    if (!scope || !seen.current || key === '') return;
    let changed = false;
    for (const id of key.split('\n')) {
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      changed = true;
    }
    if (changed) writeSeen(scope, seen.current);
  }, [scope, key]);

  return arrivals.current;
}

/** The arrival classes of one card's list item. */
export function cardArrivalClass(arrival: CardArrival | undefined): string {
  if (!arrival) return '';
  return arrival === 'opening'
    ? ' wir-card-arrive wir-card-arrive-after-opening'
    : ' wir-card-arrive';
}
