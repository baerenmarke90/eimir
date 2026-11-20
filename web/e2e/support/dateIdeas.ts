import { readFileSync } from 'node:fs';
import { expect, type Page, type Route } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import { fulfillDefaultAppIcon } from './appIcon';
import { mockEmptyPartnerNickname } from './partnerNickname';
import { fulfillUnconfiguredPhotoSources } from './photoSources';
import { fulfillEmptyPlanComments } from './planComments';
import { fulfillNoWishDateProposal } from './productContext';
import { fulfillNoOccasionSources } from './occasionSources';
import { NO_WISH_SELECTION_ROUND } from './storyTimelineFixture';

/*
 * Mocked API for the Pro date inspiration journey. The catalog response is
 * derived from the backend's bundled development dataset, so the browser
 * journey exercises the same ideas, bands and translations as the server.
 */

export const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date().toISOString();

type LocalizedLabel = { de: string; en: string };
type IdeaCopy = {
  title: string;
  description: string;
  wishTitle: string;
  planTitle: string;
  prerequisites: string[];
};
type CatalogFile = {
  catalogVersion: string;
  currency: string;
  placeTypeLabels: Record<'home' | 'out', LocalizedLabel>;
  categoryLabels: Record<string, LocalizedLabel>;
  ideas: {
    id: string;
    minutes: number;
    budgetEurForTwo: number;
    placeType: 'home' | 'out';
    category: string;
    copy: { de: IdeaCopy; en: IdeaCopy };
  }[];
};

const catalogFile = JSON.parse(
  readFileSync(
    new URL(
      '../../../backend/src/eimir/date_ideas/data/catalog.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as CatalogFile;

type ImageEntry = {
  file: string;
  width: number;
  height: number;
  alt: LocalizedLabel;
};
const imageManifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../backend/src/eimir/date_ideas/data/images.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  imagesByIdeaId: Record<string, ImageEntry>;
  imagesByCategory: Record<string, ImageEntry>;
};

function imageFor(id: string, category: string, locale: 'de' | 'en') {
  const entry =
    imageManifest.imagesByIdeaId[id] ??
    imageManifest.imagesByCategory[category];
  return {
    id: entry.file.replace(/^images\//, '').replace(/\.webp$/, ''),
    width: entry.width,
    height: entry.height,
    alt: entry.alt[locale],
  };
}

function imageBytes(imageId: string): Buffer | null {
  if (!/^(eimir-date-\d{3}|category-[a-z_]+)$/.test(imageId)) return null;
  try {
    return readFileSync(
      new URL(
        `../../../backend/src/eimir/date_ideas/data/images/${imageId}.webp`,
        import.meta.url,
      ),
    );
  } catch {
    return null;
  }
}

export function catalogIdeas(locale: 'de' | 'en' = 'de') {
  return catalogFile.ideas.map((idea) => ({
    id: idea.id,
    category: idea.category,
    placeType: idea.placeType,
    minutes: idea.minutes,
    budgetEurForTwo: idea.budgetEurForTwo,
    ...idea.copy[locale],
    contentLocale: locale,
    image: imageFor(idea.id, idea.category, locale),
  }));
}

export function catalogIdea(id: string) {
  const idea = catalogIdeas('de').find((item) => item.id === id);
  if (!idea) throw new Error(`Unknown catalog idea ${id}`);
  return idea;
}

export function categoryLabel(id: string): string {
  return catalogFile.categoryLabels[id].de;
}

export function placeLabel(id: 'home' | 'out'): string {
  return catalogFile.placeTypeLabels[id].de;
}

export type DateIdeasState = {
  pro: boolean;
  /** Fail catalog reads with this status (e.g. 503) when set. */
  catalogFailure: number | null;
  catalogRequests: number;
  imageRequests: string[];
  wishCreates: {
    body: Record<string, unknown>;
    idempotencyKey: string | null;
  }[];
  conversions: {
    wishId: string;
    ifMatch: string | null;
    body: Record<string, unknown>;
  }[];
  createdPlans: Record<string, unknown>[];
  wishes: Record<string, unknown>[];
  unexpected: string[];
};

const capabilities = { canComment: true, canDelete: true, canEdit: true };
const creator = { id: ACCOUNT_ID, displayName: 'Anna' };

function wishBody(id: string, title: string, description: string | null) {
  return {
    capabilities: { ...capabilities, canComment: false },
    createdAt: NOW,
    createdBy: ACCOUNT_ID,
    creator,
    description,
    id,
    spaceId: SPACE_ID,
    status: 'OPEN',
    title,
    updatedAt: NOW,
    version: 1,
    tags: [],
    plan: null,
    hasMemory: false,
  };
}

function planBody(id: string, body: Record<string, unknown>) {
  return {
    capabilities,
    createdAt: NOW,
    createdBy: ACCOUNT_ID,
    creator,
    description: null,
    experiencedOn: null,
    id,
    placeId: null,
    plannedEnd: null,
    plannedOn: null,
    plannedStart: null,
    sourceWishId: null,
    spaceId: SPACE_ID,
    status: 'IDEA',
    updatedAt: NOW,
    version: 1,
    tags: [],
    ...body,
  };
}

export async function installDateIdeaMocks(
  page: Page,
  options: { pro: boolean; wishes?: { id: string; title: string }[] },
): Promise<DateIdeasState> {
  const state: DateIdeasState = {
    pro: options.pro,
    catalogFailure: null,
    catalogRequests: 0,
    imageRequests: [],
    wishCreates: [],
    conversions: [],
    createdPlans: [],
    wishes: (options.wishes ?? []).map((wish) =>
      wishBody(wish.id, wish.title, null),
    ),
    unexpected: [],
  };
  let sequence = 0;
  await page.route('**/api/v1/**', async (route: Route) => {
    if (await fulfillNoWishDateProposal(route)) return;
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillUnconfiguredPhotoSources(route)) return;
    if (await fulfillEmptyPlanComments(route)) return;
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const space = `/api/v1/spaces/${SPACE_ID}`;
    const json = (body: unknown, status = 200, headers = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });
    const page_ = (items: unknown[]) =>
      json({ items, hasMore: false, nextCursor: null });
    const proRequired = () =>
      json(
        {
          type: 'forbidden',
          title: 'Forbidden',
          status: 403,
          detail:
            "This operation requires the 'planning.date_inspiration' commercial capability.",
          code: 'PREMIUM_ENTITLEMENT_REQUIRED',
        },
        403,
      );

    if (method === 'GET' && pathname === `${space}/entitlements`)
      return json({
        spaceId: SPACE_ID,
        tier: state.pro ? 'PREMIUM' : 'FREE',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: state.pro
          ? ['core', 'planning.date_inspiration']
          : ['core'],
      });
    if (method === 'GET' && pathname === '/api/v1/instance/status')
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
    if (method === 'POST' && pathname === '/api/v1/auth/sign-in')
      return json({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          accessToken: 'date-ideas-access-token',
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          refreshToken: 'date-ideas-refresh-token',
        },
      });
    if (method === 'POST' && pathname === '/api/v1/auth/refresh')
      return json({
        accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        accessToken: 'date-ideas-access-token-refreshed',
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        refreshToken: 'date-ideas-refresh-token-refreshed',
      });
    if (method === 'GET' && pathname === '/api/v1/auth/me')
      return json({ displayName: 'Anna', id: ACCOUNT_ID });
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false });
    if (method === 'GET' && pathname === '/api/v1/auth/memberships')
      return json([{ role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' }]);
    if (method === 'GET' && pathname === space)
      return json({ id: SPACE_ID, createdAt: NOW, partners: [] });
    if (method === 'GET' && pathname === `${space}/profile`)
      return json({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
    if (
      method === 'GET' &&
      (pathname === `${space}/profile-preferences` ||
        pathname === `${space}/dashboard/preferences`)
    )
      return json({ items: [] });
    if (method === 'GET' && pathname === `${space}/configuration`)
      return json(
        {
          canManageSpaceConfiguration: true,
          dailyContextTimezone: null,
          dailyQuestionsEnabled: false,
          energyCheckInEnabled: false,
          energyVisibilityMode: 'IMMEDIATE',
          loveNotesEnabled: false,
          sharedAchievementsEnabled: true,
          spaceId: SPACE_ID,
          supportGesturesEnabled: true,
          version: 1,
          vibeCheckEnabled: false,
          vibeVisibilityMode: 'IMMEDIATE',
        },
        200,
        { ETag: '"1"' },
      );
    if (method === 'GET' && pathname === `${space}/dashboard`)
      return json({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
    if (method === 'GET' && pathname === `${space}/profiles/${ACCOUNT_ID}`)
      return json({
        accountId: ACCOUNT_ID,
        createdAt: NOW,
        displayName: 'Anna',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: NOW,
        version: 1,
      });
    if (method === 'GET' && pathname === `${space}/notifications/unread-count`)
      return json({ unreadCount: 0 });
    if (method === 'POST' && pathname === `${space}/presence`)
      return json({ state: null });
    if (method === 'GET' && pathname === `${space}/places`) return page_([]);
    if (method === 'GET' && pathname === `${space}/activity`) return page_([]);
    if (method === 'GET' && pathname === `${space}/recaps`)
      return json({
        canCompose: false,
        editions: [],
        periods: [],
        hasMore: false,
        nextCursor: null,
      });
    if (method === 'GET' && pathname === `${space}/context-tags`)
      return page_([]);
    if (method === 'GET' && pathname === `${space}/collections`)
      return page_([]);
    if (method === 'GET' && pathname === `${space}/important-dates`)
      return page_([]);
    if (method === 'GET' && pathname === `${space}/plans`)
      return page_(
        url.searchParams.get('overviewScope') === 'COMPLETED'
          ? []
          : state.createdPlans,
      );
    if (method === 'GET' && pathname === `${space}/wishes`) {
      const status = url.searchParams.get('status');
      return page_(
        state.wishes.filter((wish) => !status || wish.status === status),
      );
    }
    if (method === 'GET' && pathname === `${space}/wish-selection`)
      return json(NO_WISH_SELECTION_ROUND);

    if (method === 'GET' && pathname === `${space}/date-ideas`) {
      state.catalogRequests += 1;
      if (!state.pro) return proRequired();
      if (state.catalogFailure)
        return json(
          {
            type: 'service-unavailable',
            title: 'Unavailable',
            status: state.catalogFailure,
            detail: 'Temporarily unavailable.',
            code: 'INTERNAL_ERROR',
          },
          state.catalogFailure,
        );
      const locale = url.searchParams.get('locale')?.startsWith('en')
        ? 'en'
        : 'de';
      return json(
        {
          catalogVersion: catalogFile.catalogVersion,
          locale,
          currency: catalogFile.currency,
          totalCount: catalogFile.ideas.length,
          categories: Object.entries(catalogFile.categoryLabels).map(
            ([id, labels]) => ({ id, label: labels[locale] }),
          ),
          placeTypes: (['home', 'out'] as const).map((id) => ({
            id,
            label: catalogFile.placeTypeLabels[id][locale],
          })),
          ideas: catalogIdeas(locale),
        },
        200,
        { 'Cache-Control': 'private, no-store' },
      );
    }
    const imageMatch = pathname.match(
      new RegExp(`^${space}/date-ideas/images/([^/]+)$`),
    );
    if (method === 'GET' && imageMatch) {
      state.imageRequests.push(imageMatch[1]);
      if (!state.pro) return proRequired();
      const bytes = imageBytes(imageMatch[1]);
      if (!bytes)
        return json({ code: 'DATE_IDEA_IMAGE_NOT_FOUND', status: 404 }, 404);
      return route.fulfill({
        status: 200,
        contentType: 'image/webp',
        headers: { 'Cache-Control': 'private, no-store' },
        body: bytes,
      });
    }
    if (method === 'POST' && pathname === `${space}/wishes`) {
      const body = request.postDataJSON() as Record<string, unknown>;
      const idempotencyKey = request.headers()['idempotency-key'] ?? null;
      const replay = state.wishCreates.findIndex(
        (item) => idempotencyKey && item.idempotencyKey === idempotencyKey,
      );
      state.wishCreates.push({ body, idempotencyKey });
      if (replay >= 0) return json(state.wishes[0], 200, { ETag: '"1"' });
      sequence += 1;
      const id = `66666666-6666-4666-8666-${String(sequence).padStart(12, '0')}`;
      const wish = wishBody(
        id,
        String(body.title),
        (body.description as string | undefined) ?? null,
      );
      state.wishes.unshift(wish);
      return json(wish, 201, { ETag: '"1"' });
    }
    const convertMatch = pathname.match(
      new RegExp(`^${space}/wishes/([^/]+)/plan$`),
    );
    if (method === 'POST' && convertMatch) {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.conversions.push({
        wishId: convertMatch[1],
        ifMatch: request.headers()['if-match'] ?? null,
        body,
      });
      sequence += 1;
      const plan = planBody(
        `77777777-7777-4777-8777-${String(sequence).padStart(12, '0')}`,
        { ...body, sourceWishId: convertMatch[1] },
      );
      state.createdPlans.push(plan);
      const wish = state.wishes.find((item) => item.id === convertMatch[1]);
      if (wish) wish.status = 'PLANNED';
      return json({ plan, wish }, 201);
    }
    const wishMatch = pathname.match(/\/wishes\/([^/]+)$/);
    if (method === 'GET' && wishMatch) {
      const wish = state.wishes.find((item) => item.id === wishMatch[1]);
      if (wish) return json(wish, 200, { ETag: '"1"' });
    }
    if (method === 'GET' && /\/wishes\/[^/]+\/reminder$/.test(pathname))
      return json({ dueAt: null });
    if (method === 'POST' && pathname === `${space}/plans`) {
      sequence += 1;
      const id = `77777777-7777-4777-8777-${String(sequence).padStart(12, '0')}`;
      const plan = planBody(id, request.postDataJSON());
      state.createdPlans.push(plan);
      return json(plan, 201, { ETag: '"1"' });
    }
    const planMatch = pathname.match(/\/plans\/([^/]+)$/);
    if (method === 'GET' && planMatch) {
      const plan = state.createdPlans.find((item) => item.id === planMatch[1]);
      if (plan) return json(plan, 200, { ETag: '"1"' });
    }
    if (
      method === 'GET' &&
      /\/plans\/[^/]+\/(memories|heart-moments|milestones|chapters|attachments|files|collections)$/.test(
        pathname,
      )
    )
      return page_([]);

    if (await fulfillNoOccasionSources(route)) return;
    state.unexpected.push(`${method} ${pathname}${url.search}`);
    return json(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Date ideas test does not define ${method} ${pathname}.`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
  await mockEmptyPartnerNickname(page, SPACE_ID, null);
  return state;
}

export async function signIn(page: Page): Promise<void> {
  await page.goto('/today');
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}
