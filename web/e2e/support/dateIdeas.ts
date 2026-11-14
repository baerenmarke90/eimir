import { readFileSync } from 'node:fs';
import { expect, type Page, type Route } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import { fulfillDefaultAppIcon } from './appIcon';
import { mockEmptyPartnerNickname } from './partnerNickname';
import { fulfillUnconfiguredPhotoSources } from './photoSources';
import { fulfillEmptyPlanComments } from './planComments';

/*
 * Mocked API for the Pro date inspiration journey. The catalog response is
 * derived from the backend's bundled development dataset, so the browser
 * journey exercises the same ideas, bands and translations as the server.
 */

export const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date().toISOString();

type CatalogFile = {
  catalogVersion: string;
  edition: string;
  defaultLocale: string;
  currency: string;
  categories: { id: string; labels: Record<string, string> }[];
  ideas: {
    id: string;
    active?: boolean;
    category: string;
    durationMinutes: { min: number; max: number };
    budgetForTwo: { min: number; max: number };
    setting: 'HOME' | 'OUT' | 'EITHER';
    content: Record<
      string,
      { title: string; description: string; requirements?: string[] }
    >;
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

function durationBand(max: number) {
  return max <= 90 ? 'SHORT' : max <= 240 ? 'EVENING' : 'LONG';
}

function budgetBand(max: number) {
  return max <= 0 ? 'FREE' : max <= 30 ? 'LOW' : max <= 80 ? 'MEDIUM' : 'HIGH';
}

export function catalogIdeas(locale = 'de') {
  return catalogFile.ideas
    .filter((idea) => idea.active !== false)
    .map((idea) => {
      const contentLocale = idea.content[locale]
        ? locale
        : catalogFile.defaultLocale;
      const content = idea.content[contentLocale];
      return {
        id: idea.id,
        title: content.title,
        description: content.description,
        requirements: content.requirements ?? [],
        categoryId: idea.category,
        contentLocale,
        durationMinMinutes: idea.durationMinutes.min,
        durationMaxMinutes: idea.durationMinutes.max,
        durationBand: durationBand(idea.durationMinutes.max),
        budgetMin: idea.budgetForTwo.min,
        budgetMax: idea.budgetForTwo.max,
        budgetBand: budgetBand(idea.budgetForTwo.max),
        setting: idea.setting,
      };
    });
}

export type DateIdeasState = {
  pro: boolean;
  /** Fail catalog reads with this status (e.g. 503) when set. */
  catalogFailure: number | null;
  catalogRequests: number;
  saved: Map<string, string>;
  wishSaves: { ideaId: string; idempotencyKey: string | null }[];
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
    saved: new Map(),
    wishSaves: [],
    createdPlans: [],
    wishes: (options.wishes ?? []).map((wish) =>
      wishBody(wish.id, wish.title, null),
    ),
    unexpected: [],
  };
  let sequence = 0;
  await page.route('**/api/v1/**', async (route: Route) => {
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
        auth: { localPassword: true, passkey: true, magicLink: true, oidc: false },
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
    if (method === 'GET' && pathname === `${space}/wish-selections/current`)
      return json(
        {
          code: 'WISH_SELECTION_NOT_FOUND',
          detail: 'No current round.',
          status: 404,
          title: 'Not Found',
          type: 'not-found',
        },
        404,
      );

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
          edition: catalogFile.edition,
          locale,
          currency: catalogFile.currency,
          totalCount: catalogIdeas(locale).length,
          categories: catalogFile.categories.map((category) => ({
            id: category.id,
            label: category.labels[locale] ?? category.labels.de,
          })),
          ideas: catalogIdeas(locale).map((idea) => {
            const savedWishId = state.saved.get(idea.id);
            return savedWishId ? { ...idea, savedWishId } : idea;
          }),
        },
        200,
        { 'Cache-Control': 'private, no-store' },
      );
    }
    const saveMatch = pathname.match(
      new RegExp(`^${space}/date-ideas/([^/]+)/wish$`),
    );
    if (method === 'POST' && saveMatch) {
      if (!state.pro) return proRequired();
      const ideaId = saveMatch[1];
      state.wishSaves.push({
        ideaId,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
      });
      const existing = state.saved.get(ideaId);
      if (existing) {
        const wish = state.wishes.find((item) => item.id === existing);
        return json(wish, 200, { ETag: '"1"' });
      }
      const idea = catalogIdeas('de').find((item) => item.id === ideaId);
      if (!idea) return json({ code: 'DATE_IDEA_NOT_FOUND', status: 404 }, 404);
      sequence += 1;
      const id = `66666666-6666-4666-8666-${String(sequence).padStart(12, '0')}`;
      const wish = wishBody(id, idea.title, idea.description);
      state.wishes.unshift(wish);
      state.saved.set(ideaId, id);
      return json(wish, 201, { ETag: '"1"' });
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
