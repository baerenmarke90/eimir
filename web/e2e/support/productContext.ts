import type { Route } from '@playwright/test';
import { fulfillDefaultPersonalSettings } from './personalSettings';
import { fulfillNoSharedNotes } from './sharedNotes';
import { NO_WISH_SELECTION_ROUND } from './storyTimelineFixture';

/** Unrelated Wish journeys have no active date exchange. */
export async function fulfillNoWishDateProposal(
  route: Route,
): Promise<boolean> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (
    request.method() !== 'GET' ||
    !/^\/api\/v1\/spaces\/[^/]+\/wishes\/[^/]+\/date-proposal$/.test(pathname)
  )
    return false;
  await route.fulfill({
    json: { canPropose: false, proposal: null },
    headers: { 'Cache-Control': 'private, no-store' },
  });
  return true;
}

/**
 * The Wishes entry row reads whether a shared round is open (#1907 J1).
 * Unrelated Planning journeys have none; round journeys install their own.
 */
export async function fulfillNoWishSelectionRound(
  route: Route,
): Promise<boolean> {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (
    request.method() !== 'GET' ||
    !/^\/api\/v1\/spaces\/[^/]+\/wish-selection$/.test(pathname)
  )
    return false;
  await route.fulfill({
    json: NO_WISH_SELECTION_ROUND,
    headers: { 'Cache-Control': 'private, no-store' },
  });
  return true;
}

/** Narrow defaults for unrelated journeys; feature journeys override them explicitly. */
export async function fulfillDefaultProductContext(
  route: Route,
): Promise<boolean> {
  if (await fulfillNoSharedNotes(route)) return true;
  if (await fulfillDefaultPersonalSettings(route)) return true;
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  // An unrelated journey starts without pending one-time messages. Feature
  // journeys install their explicit encrypted-message contract before this fallback.
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/once-messages$/.test(pathname)
  ) {
    await route.fulfill({
      json: { items: [] },
      headers: { 'Cache-Control': 'private, no-store' },
    });
    return true;
  }
  // Without a saved choice the person sees the automatic blue and rose pair.
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/appearance\/person-colours$/.test(pathname)
  ) {
    await route.fulfill({
      json: { colours: null, version: 0 },
      headers: {
        ETag: '"fixture-person-colours:absent"',
        'Cache-Control': 'private, no-store',
      },
    });
    return true;
  }
  // Without a saved choice Momente › Erinnerungen shows the default Story
  // (#2283).
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/appearance\/memory-world$/.test(pathname)
  ) {
    await route.fulfill({
      json: { worldId: 'story', version: 0 },
      headers: {
        ETag: '"fixture-memory-world:absent"',
        'Cache-Control': 'private, no-store',
      },
    });
    return true;
  }
  // The personal Wir reel style: journeys see the default circles (#2345).
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/appearance\/wir-reels$/.test(pathname)
  ) {
    await route.fulfill({
      json: { styleId: 'circles', version: 0 },
      headers: {
        ETag: '"fixture-wir-reels:absent"',
        'Cache-Control': 'private, no-store',
      },
    });
    return true;
  }
  // Explicit shell/bootstrap additions only. Dedicated acceptance journeys
  // intercept these before this default; arbitrary writes remain unexpected.
  if (
    request.method() === 'PUT' &&
    pathname === '/api/v1/account/device-context'
  ) {
    const body = request.postDataJSON() as {
      timezone: string;
      spaceId: string;
    };
    if (
      !body.timezone ||
      !body.spaceId ||
      Object.keys(body).some((key) => !['timezone', 'spaceId'].includes(key))
    )
      throw new Error('Unexpected device context');
    await route.fulfill({
      json: { timezone: body.timezone, sharedDayPending: false },
      headers: { 'Cache-Control': 'private, no-store' },
    });
    return true;
  }
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/context-tag-suggestions$/.test(pathname)
  ) {
    await route.fulfill({ json: { learned: [], proposed: [] } });
    return true;
  }
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/(memories\/[^/]+\/(plans|wishes)|(heart-moments|milestones)\/[^/]+\/plans)$/.test(
      pathname,
    )
  ) {
    await route.fulfill({ json: { items: [] } });
    return true;
  }
  if (
    request.method() === 'GET' &&
    /^\/api\/v1\/spaces\/[^/]+\/plans\/[^/]+\/story$/.test(pathname)
  ) {
    await route.fulfill({
      json: { items: [], nextCursor: null, hasMore: false },
    });
    return true;
  }
  return false;
}
