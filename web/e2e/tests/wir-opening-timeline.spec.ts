import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type Route, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import { fulfillNoOccasionSources } from '../support/occasionSources';

/**
 * #2147: the Wir opening runs on one stage clock. The portraits, names, heart
 * line, check-in, distance, quote and the modules below share one start; data
 * that arrives while the opening runs joins it, data that arrives after it
 * appears at rest, and nothing plays twice. The timeline is read from the
 * document timeline (`document.getAnimations()` and each animation's computed
 * timing), so the result does not depend on how fast the runner paints.
 */

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-000000000002';
const SPACE_ID = '00000000-0000-0000-0000-000000000010';
const PHOTO_ATTACHMENT_ID = '00000000-0000-0000-0000-000000000030';
/** Product Owner target (#2147): every element at rest about 2.5 s after the first Wir paint. */
const OPENING_TARGET_MS = 2_500;
/**
 * Slack for a busy runner: the data hold's timer and the first-paint frame
 * can each land one long frame late.
 */
const FRAME_SLACK_MS = 200;
/** A tiny decodable PNG for the partner's photo. */
const PHOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==',
  'base64',
);

type LateData = 'checkIn' | 'distance' | 'quote' | 'photo';

interface Scenario {
  /** Milliseconds by which the late hero data is held after the dashboard. */
  lateDelayMs?: number;
  /** Which reads are held. Default: all of them. */
  late?: readonly LateData[];
}

const hold = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : undefined;

async function installMocks(page: Page, scenario: Scenario = {}) {
  const lateDelayMs = scenario.lateDelayMs ?? 0;
  const late = new Set<LateData>(
    scenario.late ?? ['checkIn', 'distance', 'quote', 'photo'],
  );
  const delayFor = (kind: LateData) => (late.has(kind) ? lateDelayMs : 0);
  const space = `/api/v1/spaces/${SPACE_ID}`;
  const unexpected: string[] = [];

  await page.route('**/api/v1/**', async (route: Route) => {
    if (await fulfillDefaultAppIconExceptDesign(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      return json({
        maintenanceMode: false,
        registrationAvailable: true,
        registrationUnavailableReason: null,
        auth: {
          localPassword: true,
          passkey: true,
          magicLink: true,
          oidc: false,
        },
      });
    }
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      return json({
        account: { displayName: 'Lea', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'wir-opening-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'wir-opening-refresh-token',
        },
      });
    }
    if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
      return json({
        account: { displayName: 'Lea', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'wir-opening-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'wir-opening-refresh-token',
        },
      });
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      return json({ id: ACCOUNT_ID, displayName: 'Lea' });
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      return json({ serverAdmin: false });
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    }
    if (method === 'GET' && pathname === space) {
      return json({
        id: SPACE_ID,
        createdAt: '2023-08-23T00:00:00Z',
        partners: [
          { id: ACCOUNT_ID, displayName: 'Lea' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      });
    }
    if (method === 'GET' && pathname === `${space}/appearance/wir-design`) {
      return json({ designId: 'connected', version: 1 });
    }
    if (method === 'GET' && pathname === `${space}/configuration`) {
      return route.fulfill({
        headers: { ETag: '"7"' },
        json: {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: 'Europe/Berlin',
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: true,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: false,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 7,
          vibeCheckEnabled: true,
          vibeVisibilityMode: 'IMMEDIATE',
        },
      });
    }
    const profile = pathname.match(
      new RegExp(`^${space}/profiles/(${ACCOUNT_ID}|${PARTNER_ID})$`),
    );
    if (method === 'GET' && profile) {
      const partner = profile[1] === PARTNER_ID;
      return json({
        accountId: profile[1],
        createdAt: '2026-01-01T00:00:00Z',
        displayName: partner ? 'Alex' : 'Lea',
        birthday: null,
        id: partner
          ? '00000000-0000-0000-0000-000000000022'
          : '00000000-0000-0000-0000-000000000020',
        preferences: [],
        profileAttachmentId: partner ? PHOTO_ATTACHMENT_ID : null,
        updatedAt: '2026-01-01T00:00:00Z',
        version: 1,
      });
    }
    if (
      method === 'GET' &&
      pathname === `${space}/profiles/${PARTNER_ID}/avatar/content`
    ) {
      await hold(delayFor('photo'));
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PHOTO_PNG,
      });
    }
    if (method === 'GET' && pathname === `${space}/dashboard/preferences`) {
      return json({ items: [] });
    }
    if (method === 'GET' && pathname === `${space}/dashboard`) {
      return json({
        space: {
          spaceId: SPACE_ID,
          partner: { id: PARTNER_ID, displayName: 'Alex' },
        },
        relationshipDuration: {
          daysTogether: 1178,
          startedOn: '2023-08-23',
          displayMode: 'DAYS',
        },
        retrospective: null,
        recentShared: [],
        upcoming: [
          {
            id: 'plan-1',
            type: 'PLAN',
            titleOrText: 'Picnic by the lake',
            scheduledAt: '2026-11-16T10:00:00Z',
          },
        ],
        thinkingOfYouAvailableAt: null,
      });
    }
    if (method === 'GET' && pathname === `${space}/recaps`) {
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
      });
    }
    if (method === 'GET' && pathname === `${space}/activity`) {
      return json({ hasMore: false, items: [], nextCursor: null });
    }
    if (
      method === 'GET' &&
      pathname === `${space}/notifications/unread-count`
    ) {
      return json({ unreadCount: 0 });
    }
    if (method === 'GET' && pathname === `${space}/partner-nickname`) {
      return json({ partnerId: PARTNER_ID, nickname: null, version: 0 });
    }
    if (method === 'GET' && pathname === `${space}/entitlements`) {
      return json({
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['core', 'presence.location', 'daily.quote'],
      });
    }
    if (
      (method === 'GET' || method === 'POST') &&
      pathname === `${space}/presence`
    ) {
      return json({ state: 'UNKNOWN' });
    }
    if (method === 'GET' && pathname === `${space}/daily-check-in/today`) {
      await hold(delayFor('checkIn'));
      return route.fulfill({
        headers: {
          ETag: '"2026-11-13:check-in:1"',
          'Cache-Control': 'private, no-store',
        },
        json: {
          checkedOn: '2026-11-13',
          dailyContextTimezone: 'Europe/Berlin',
          own: { energyLevel: 80, vibe: 'GOOD', vibeNote: null, version: 1 },
          energy: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'VISIBLE', value: 40 },
          },
          vibe: {
            visibilityMode: 'IMMEDIATE',
            partner: { state: 'VISIBLE', value: 'OKAY' },
            partnerNote: null,
          },
        },
      });
    }
    if (method === 'GET' && pathname === `${space}/daily-quote`) {
      await hold(delayFor('quote'));
      return json({
        checkedOn: '2026-11-13',
        enabled: true,
        quote: {
          id: 'quote-wir-opening',
          text: 'Love is when two people can be quiet together and still feel close.',
          authorDisplay: 'Example Author',
          sourceDisplay: 'Example Source',
          sourceId: 'classic_literature',
          categoryIds: ['love'],
          locale: 'de',
          rightsClassification: 'PUBLIC_DOMAIN',
          attributionRequired: true,
        },
      });
    }
    if (pathname === `${space}/partner-location/settings` && method === 'GET') {
      return json({
        available: true,
        level: 'DISTANCE',
        state: 'ACTIVE',
        indefinite: true,
        expiresAt: null,
        generation: 3,
        lastPublishedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      });
    }
    if (
      pathname === `${space}/partner-location/distance` &&
      method === 'POST'
    ) {
      await hold(delayFor('distance'));
      return json({
        available: true,
        band: { kind: 'APPROXIMATE', approximateKm: 340 },
        asOf: new Date(Date.now() - 20 * 60_000).toISOString(),
      });
    }
    if (pathname === `${space}/partner-location/map` && method === 'GET') {
      return json({ available: false });
    }
    if (pathname.startsWith(`${space}/partner-location`)) {
      return json({
        available: true,
        level: 'DISTANCE',
        state: 'ACTIVE',
        indefinite: true,
        expiresAt: null,
        generation: 3,
        lastPublishedAt: null,
      });
    }
    if (await fulfillNoOccasionSources(route)) return;
    if (method === 'GET') {
      // Neutral, empty reads for neighbours this journey does not review.
      unexpected.push(`${method} ${pathname}`);
      return route.fulfill({
        status: 404,
        json: { status: 404, title: 'Not found' },
      });
    }
    unexpected.push(`${method} ${pathname}`);
    return json(
      { code: 'E2E_UNEXPECTED_REQUEST', status: 500, title: 'Unexpected' },
      500,
    );
  });
  return { unexpected };
}

/** The shared defaults, without overriding this journey's Wir design. */
async function fulfillDefaultAppIconExceptDesign(route: Route) {
  if (
    new URL(route.request().url()).pathname.endsWith('/appearance/wir-design')
  )
    return false;
  return fulfillDefaultAppIcon(route);
}

/**
 * Records every animation and transition the document runs, with its target,
 * its absolute start and end on the document timeline and whether it changes
 * opacity; the time the Wir stage first painted; and, on every frame, the
 * layout box (transforms excluded) of the hero, the quote and the first module
 * with whether it is painted.
 */
async function installTimelineRecorder(page: Page) {
  await page.addInitScript(() => {
    type Entry = {
      target: string;
      element: Element | null;
      pseudo: string | null;
      name: string;
      start: number | null;
      end: number | null;
      opacity: boolean;
      iterations: number;
      onWir: boolean;
    };
    type Box = { at: number; top: number; height: number; painted: boolean };
    const state = {
      stagePaint: null as number | null,
      entries: [] as Entry[],
      boxes: {} as Record<string, Box[]>,
    };
    (window as unknown as { __wirTimeline: typeof state }).__wirTimeline =
      state;
    const seen = new WeakSet<Animation>();
    const describe = (element: Element | null, pseudo: string | null) => {
      if (!element) return '?';
      const classes = [...element.classList].slice(0, 3).join('.');
      return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}${pseudo ?? ''}`;
    };
    const painted = (element: Element) => {
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (Number(style.opacity) < 0.05 || style.visibility === 'hidden')
          return false;
      }
      return true;
    };
    const layoutTop = (element: HTMLElement) => {
      let top = 0;
      for (
        let node: HTMLElement | null = element;
        node;
        node = node.offsetParent as HTMLElement | null
      )
        top += node.offsetTop;
      return top;
    };
    const tracked: Record<string, string> = {
      hero: '.wir-stage',
      quote: '.daily-quote-card',
      module: '.today-section',
    };
    const frame = () => {
      const now = document.timeline.currentTime as number;
      if (document.querySelector('.wir-stage') && state.stagePaint === null)
        state.stagePaint = now;
      for (const animation of document.getAnimations()) {
        if (seen.has(animation)) continue;
        seen.add(animation);
        const effect = animation.effect as KeyframeEffect | null;
        const timing = effect?.getComputedTiming();
        const keyframes = effect?.getKeyframes?.() ?? [];
        const transition = (animation as Partial<CSSTransition>)
          .transitionProperty;
        const name =
          (animation as Partial<CSSAnimation>).animationName ??
          (transition ? `transition:${transition}` : animation.id || 'web');
        const onDocument = animation.timeline === document.timeline;
        // The active start: the start time plus the delay of its slot.
        const start = (animation.startTime ?? now) + Number(timing?.delay ?? 0);
        state.entries.push({
          target: describe(
            effect?.target ?? null,
            effect?.pseudoElement ?? null,
          ),
          element: effect?.target ?? null,
          pseudo: effect?.pseudoElement ?? null,
          name,
          start: onDocument ? start : null,
          end:
            onDocument && Number.isFinite(timing?.endTime)
              ? (animation.startTime ?? now) + Number(timing?.endTime)
              : null,
          opacity:
            transition === 'opacity' ||
            keyframes.some((keyframe) => 'opacity' in keyframe),
          iterations: Number(timing?.iterations ?? 1),
          onWir: Boolean(effect?.target?.closest('.today-page')),
        });
      }
      for (const [key, selector] of Object.entries(tracked)) {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) continue;
        state.boxes[key] ??= [];
        const list = state.boxes[key];
        const box = {
          at: now,
          top: layoutTop(element),
          height: element.offsetHeight,
          painted: painted(element),
        };
        const last = list.at(-1);
        if (
          !last ||
          last.top !== box.top ||
          last.height !== box.height ||
          last.painted !== box.painted
        )
          list.push(box);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

interface TimelineEntry {
  target: string;
  name: string;
  start: number | null;
  end: number | null;
  opacity: boolean;
  iterations: number;
  onWir: boolean;
  element: number;
  /** Indexes of entries whose element contains this one's (or is it). */
  outer: number[];
}

interface Timeline {
  stagePaint: number | null;
  entries: TimelineEntry[];
  boxes: Record<
    string,
    { at: number; top: number; height: number; painted: boolean }[]
  >;
}

async function readTimeline(page: Page): Promise<Timeline> {
  return page.evaluate(() => {
    type Raw = {
      target: string;
      element: Element | null;
      pseudo: string | null;
      name: string;
      start: number | null;
      end: number | null;
      opacity: boolean;
      iterations: number;
      onWir: boolean;
    };
    const state = (
      window as unknown as {
        __wirTimeline: {
          stagePaint: number | null;
          entries: Raw[];
          boxes: Timeline['boxes'];
        };
      }
    ).__wirTimeline;
    const elements: Element[] = [];
    const indexOf = (element: Element | null) => {
      if (!element) return -1;
      const found = elements.indexOf(element);
      if (found >= 0) return found;
      elements.push(element);
      return elements.length - 1;
    };
    return {
      stagePaint: state.stagePaint,
      boxes: state.boxes,
      entries: state.entries.map((entry, index) => ({
        target: entry.target,
        name: entry.name,
        start: entry.start,
        end: entry.end,
        opacity: entry.opacity,
        iterations: entry.iterations,
        onWir: entry.onWir,
        element: indexOf(entry.element),
        outer: state.entries
          .map((other, otherIndex) =>
            otherIndex !== index &&
            other.element &&
            entry.element &&
            other.element.contains(entry.element) &&
            (other.element !== entry.element || other.pseudo !== entry.pseudo)
              ? otherIndex
              : -1,
          )
          .filter((otherIndex) => otherIndex >= 0),
      })),
    };
  });
}

/**
 * One-shot motion of the opening and what follows it: finite, on the document
 * timeline; not ambient (the ring breath repeats) and not the invisible
 * visibility switch of the initials under a photo.
 */
function oneShot(timeline: Timeline) {
  return timeline.entries.filter(
    (entry) =>
      entry.end !== null &&
      entry.start !== null &&
      entry.iterations <= 1 &&
      !entry.name.includes('ambient') &&
      entry.name !== 'transition:visibility',
  );
}

/** The opening's numbers, in ms after the first Wir paint. */
function measure(timeline: Timeline) {
  const paint = timeline.stagePaint ?? 0;
  const motion = oneShot(timeline);
  const lastEnd = Math.max(
    0,
    ...motion.map((entry) => (entry.end ?? 0) - paint),
  );
  // Two opacity animations on one element: something fades twice.
  const twice = new Map<number, string[]>();
  for (const entry of motion.filter(
    (item) => item.opacity && item.element >= 0,
  )) {
    const list = twice.get(entry.element) ?? [];
    list.push(`${entry.target} ${entry.name}`);
    twice.set(entry.element, list);
  }
  const fadesTwice = [...twice.values()].filter((list) => list.length > 1);
  // An opacity animation inside another one that runs at the same time.
  const nested = motion.flatMap((entry, index) =>
    entry.opacity
      ? entry.outer
          .map((outerIndex) => timeline.entries[outerIndex])
          .filter(
            (outer) =>
              outer &&
              motion.includes(outer) &&
              outer.opacity &&
              // Back to back is not nested (1 ms for rounding).
              (outer.start ?? 0) < (entry.end ?? 0) - 1 &&
              (entry.start ?? 0) < (outer.end ?? 0) - 1 &&
              timeline.entries.indexOf(outer) !== index,
          )
          .map((outer) => `${entry.target} in ${outer.target}`)
      : [],
  );
  // The most elements animating at once (Motion Contract M15: at most 12).
  const edges = motion.flatMap((entry) => [
    { at: entry.start ?? 0, delta: 1 },
    { at: entry.end ?? 0, delta: -1 },
  ]);
  edges.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let running = 0;
  let peak = 0;
  for (const edge of edges) {
    running += edge.delta;
    peak = Math.max(peak, running);
  }
  return { paint, lastEnd, fadesTwice, nested, peak, motion };
}

/** Layout changes of a box after it was first painted. */
function jumpsAfterPaint(timeline: Timeline, key: string) {
  const list = timeline.boxes[key] ?? [];
  const first = list.findIndex((box) => box.painted);
  if (first < 0) return [];
  const settled = list[first];
  return list
    .slice(first + 1)
    .filter(
      (box) =>
        Math.abs(box.top - settled.top) > 1 ||
        Math.abs(box.height - settled.height) > 1,
    )
    .map(
      (box) =>
        `${key} at ${Math.round(box.at - (timeline.stagePaint ?? 0))} ms: ${settled.top}/${settled.height} -> ${box.top}/${box.height}`,
    );
}

function exportEvidence(name: string, body: unknown) {
  const text = JSON.stringify(body, null, 2);
  fs.writeFileSync(test.info().outputPath(`${name}.json`), text);
  const dir = process.env.VISUAL_EVIDENCE_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), text);
  }
}

/** A readable table of the opening, for the PR evidence. */
function table(timeline: Timeline) {
  const paint = timeline.stagePaint ?? 0;
  return oneShot(timeline)
    .map((entry) => ({
      target: entry.target,
      name: entry.name,
      start: Math.round((entry.start ?? 0) - paint),
      end: Math.round((entry.end ?? 0) - paint),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

async function grantLocation(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({
    latitude: 50.94,
    longitude: 6.96,
    accuracy: 1500,
  });
}

/** The partner's check-in was already seen on this device today. */
async function partnerNewsSeen(page: Page) {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          day: '2026-11-13:Europe/Berlin',
          vibe: 'OKAY',
          energy: 40,
          note: null,
        }),
      );
    },
    { key: `eimir.wir.partnerArrivalSeen:${ACCOUNT_ID}:${SPACE_ID}` },
  );
}

interface ColdStart extends Scenario {
  width?: number;
  theme?: 'light' | 'dark';
  reduced?: boolean;
  newsSeen?: boolean;
}

/**
 * Signs in, then starts the app again with the stored session: a cold start
 * that opens on Wir, with the stage's first paint recorded.
 */
async function openWirCold(page: Page, options: ColdStart = {}) {
  // A fixed day keeps the quote, the check-in day and the distance stable.
  await page.clock.setFixedTime(new Date('2026-11-13T09:00:00+01:00'));
  await grantLocation(page);
  await page.setViewportSize({ width: options.width ?? 390, height: 844 });
  await page.emulateMedia({
    reducedMotion: options.reduced ? 'reduce' : 'no-preference',
    colorScheme: options.theme ?? 'light',
  });
  if (options.newsSeen ?? true) await partnerNewsSeen(page);
  const server = await installMocks(page, options);
  await installTimelineRecorder(page);
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.wir-stage')).toBeVisible();
  await page.reload();
  await expect(page.locator('.wir-stage')).toBeVisible();
  return server;
}

/** Everything has arrived and Wir is at rest. */
async function expectComplete(page: Page) {
  await expect(page.locator('.wir-hero-distance')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('.daily-quote-block')).toBeVisible();
  await expect(page.getByTestId('wir-checkin-partner-badge')).toBeVisible();
  await expect(page.locator('.wir-stage')).not.toHaveAttribute(
    'data-motion-stage',
    /.*/,
  );
  await page.waitForTimeout(1_000);
}

for (const { label, lateDelayMs } of [
  { label: 'all hero data at once', lateDelayMs: 0 },
  { label: 'quote, place, check-in and photo at 1 s', lateDelayMs: 1_000 },
  { label: 'quote, place, check-in and photo at 3 s', lateDelayMs: 3_000 },
]) {
  test(`#2147 opening on one clock: ${label}`, async ({ page }) => {
    test.setTimeout(60_000);
    await openWirCold(page, { lateDelayMs });
    await expectComplete(page);
    const timeline = await readTimeline(page);
    const result = measure(timeline);
    exportEvidence(`2147-timeline-${lateDelayMs}ms`, {
      lastEndMs: Math.round(result.lastEnd),
      peak: result.peak,
      table: table(timeline),
      boxes: timeline.boxes,
    });

    // Every element is at rest about 2.5 s after the first Wir paint, with
    // late data either joining the opening or arriving at rest.
    expect(result.lastEnd).toBeLessThanOrEqual(
      OPENING_TARGET_MS + FRAME_SLACK_MS,
    );
    expect(result.fadesTwice).toEqual([]);
    expect(result.nested).toEqual([]);
    expect(result.peak).toBeLessThanOrEqual(12);
    // Nothing that was painted moves when the quote, the place or the check-in
    // arrives.
    for (const key of ['hero', 'quote', 'module'])
      expect(jumpsAfterPaint(timeline, key)).toEqual([]);
    if (lateDelayMs >= 3_000) {
      // Data after the opening is simply there: nothing starts after it.
      const late = result.motion.filter(
        (entry) => (entry.start ?? 0) - result.paint > OPENING_TARGET_MS,
      );
      expect(late.map((entry) => `${entry.target} ${entry.name}`)).toEqual([]);
    }
  });
}

test('#2147 the opening never replays on a tab return', async ({ page }) => {
  test.setTimeout(60_000);
  await openWirCold(page);
  await expectComplete(page);
  const before = (await readTimeline(page)).entries.length;
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await navigation.getByRole('link', { name: 'Planen' }).click();
  await expect(page).toHaveURL(/\/plan/);
  await navigation.getByRole('link', { name: 'Wir' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.waitForTimeout(1_500);
  const after = await readTimeline(page);
  // No entrance on Wir plays again: not the opening, the quote or a module.
  const replayed = oneShot({ ...after, entries: after.entries.slice(before) })
    // The route's backdrop belongs to the tab change (Replace `navigate`).
    .filter((entry) => entry.onWir && !entry.target.includes('today-page::'))
    .filter((entry) => /^eimir-motion-(stage|enter|root)-/.test(entry.name));
  expect(replayed.map((entry) => `${entry.target} ${entry.name}`)).toEqual([]);
});

test('#2147 reduced motion: the same layout, nothing moves when data arrives', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openWirCold(page, { reduced: true, lateDelayMs: 1_000 });
  await expectComplete(page);
  const reduced = await readTimeline(page);
  expect(
    oneShot(reduced).filter((entry) => (entry.end ?? 0) > (entry.start ?? 0)),
  ).toEqual([]);
  // Painted content does not jump for data within the data hold, and the
  // composition matches the animated end state.
  for (const key of ['hero', 'quote', 'module'])
    expect(jumpsAfterPaint(reduced, key)).toEqual([]);
  const reducedBoxes = await page.evaluate(() =>
    ['.wir-stage', '.daily-quote-card', '.today-section'].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? [element.offsetTop, element.offsetHeight] : null;
    }),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const animatedBoxes = await page.evaluate(() =>
    ['.wir-stage', '.daily-quote-card', '.today-section'].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? [element.offsetTop, element.offsetHeight] : null;
    }),
  );
  expect(reducedBoxes).toEqual(animatedBoxes);
});

test('#2147 the partner news waits for the opening and never shows twice', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openWirCold(page, { newsSeen: false });
  await expectComplete(page);
  await page.waitForTimeout(2_500);
  const timeline = await readTimeline(page);
  const stageEnd = Math.max(
    ...timeline.entries
      .filter((entry) => entry.name.startsWith('eimir-motion-stage-'))
      .map((entry) => entry.end ?? 0),
  );
  const arrival = timeline.entries.filter((entry) =>
    entry.target.includes('wir-checkin-flight'),
  );
  expect(arrival.length).toBeGreaterThan(0);
  for (const entry of arrival)
    expect(entry.start ?? 0).toBeGreaterThanOrEqual(stageEnd - FRAME_SLACK_MS);
  // The partner's values were hidden until they landed: the badge content
  // never faded in on its own.
  expect(
    timeline.entries.filter(
      (entry) =>
        entry.target.includes('wir-checkin-badge-content') &&
        entry.name.startsWith('eimir-motion-enter-'),
    ),
  ).toEqual([]);
});

/*
 * Visual evidence (frame sequences of the opening) for the pull request,
 * recorded only when VISUAL_EVIDENCE_DIR is set.
 */
for (const variant of [
  { width: 360, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 430, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 390, theme: 'light', reduced: true },
  { width: 390, theme: 'light', lateDelayMs: 1_000 },
  { width: 390, theme: 'dark', lateDelayMs: 3_000 },
  { width: 1280, theme: 'light' },
] satisfies ColdStart[]) {
  const label = `${variant.width}-${variant.theme}${variant.reduced ? '-reduced' : ''}${variant.lateDelayMs ? `-late-${variant.lateDelayMs}ms` : ''}`;
  test(`#2147 frames ${label}`, async ({ page }) => {
    const dir = process.env.VISUAL_EVIDENCE_DIR;
    test.skip(!dir, 'Evidence frames are recorded on request only.');
    test.setTimeout(90_000);
    await openWirCold(page, variant);
    const start = Date.now();
    const shots: string[] = [];
    while (Date.now() - start < 3_600) {
      const name = `2147-${label}-${String(Date.now() - start).padStart(4, '0')}ms.png`;
      await page.screenshot({ path: path.join(dir ?? '', name) });
      shots.push(name);
      await page.waitForTimeout(120);
    }
    expect(shots.length).toBeGreaterThan(3);
  });
}
