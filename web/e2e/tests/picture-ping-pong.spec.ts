import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';
import games from '../../src/i18n/locales/games';
import { fulfillDefaultAppIcon } from '../support/appIcon';
import AxeBuilder from '../support/axe';
import { fulfillEmptyPlanComments } from '../support/planComments';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PARTNER_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const TEST_NOW = '2026-09-13T10:00:00Z';

// Stateful stand-in for the picture endpoints; reset per page load.
// biome-ignore lint/suspicious/noExplicitAny: loose JSON fixture
let picture: any = null;
const turnRequests: Array<{
  turnsDone: number;
  strokes: Array<{ colour: string; points: number[] }>;
}> = [];
const startRequests: Array<{ starter?: string } | null> = [];

function localized(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template,
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

// A 1x1 PNG stands in for both profile pictures.
const AVATAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQBJ5D4dAAAAAElFTkSuQmCC',
  'base64',
);
const AVATAR_IDS: Record<string, string> = {
  [ACCOUNT_ID]: '55555555-5555-4555-8555-555555555555',
  [PARTNER_ID]: '66666666-6666-4666-8666-666666666666',
};

async function installApiMocks(
  page: Page,
  { avatars = false }: { avatars?: boolean } = {},
): Promise<void> {
  picture = null;
  turnRequests.length = 0;
  startRequests.length = 0;
  await page.route('**/api/v1/**', async (route) => {
    if (await fulfillDefaultAppIcon(route)) return;
    if (await fulfillEmptyPlanComments(route)) return;
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const fulfillJson = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && pathname === '/api/v1/instance/status') {
      await fulfillJson({
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
      return;
    }

    if (method === 'POST' && pathname === '/api/v1/auth/sign-in') {
      await fulfillJson({
        account: { displayName: 'Anna', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'wish-detective-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'wish-detective-refresh-token',
        },
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Anna', id: ACCOUNT_ID });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/capabilities') {
      await fulfillJson({ serverAdmin: false });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/memberships') {
      await fulfillJson([
        { role: 'MEMBER', spaceId: SPACE_ID, status: 'ACTIVE' },
      ]);
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}`) {
      await fulfillJson({
        id: SPACE_ID,
        createdAt: TEST_NOW,
        partners: [
          { id: ACCOUNT_ID, displayName: 'Anna' },
          { id: PARTNER_ID, displayName: 'Alex' },
        ],
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: null,
        showRelationshipDuration: false,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/profile-preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard/preferences`
    ) {
      await fulfillJson({ items: [] });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/dashboard`
    ) {
      await fulfillJson({
        recentShared: [],
        relationshipDuration: null,
        retrospective: null,
        space: { partner: null, spaceId: SPACE_ID },
        upcoming: [],
      });
      return;
    }
    const profileMatch = pathname.match(
      new RegExp(
        `^/api/v1/spaces/${SPACE_ID}/profiles/([^/]+)(/avatar/content)?$`,
      ),
    );
    const profileOwner = profileMatch?.[1];
    if (
      method === 'GET' &&
      profileOwner &&
      (profileOwner === ACCOUNT_ID || (avatars && profileOwner === PARTNER_ID))
    ) {
      if (profileMatch?.[2]) {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: AVATAR_PNG,
        });
        return;
      }
      await fulfillJson({
        accountId: profileOwner,
        createdAt: TEST_NOW,
        displayName: profileOwner === ACCOUNT_ID ? 'Anna' : 'Alex',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: avatars ? AVATAR_IDS[profileOwner] : null,
        updatedAt: TEST_NOW,
        version: 1,
      });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/notifications/unread-count`
    ) {
      await fulfillJson({ unreadCount: 0 });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/entitlements`
    ) {
      await fulfillJson({
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        effectiveUntil: null,
        isInGracePeriod: false,
        capabilities: ['games.couple'],
      });
      return;
    }
    if (pathname === `/api/v1/spaces/${SPACE_ID}/games/picture-ping-pong`) {
      if (method === 'POST') {
        const body = request.postDataJSON() as { starter?: string } | null;
        startRequests.push(body);
        picture = {
          id: '70000000-0000-4000-8000-000000000001',
          status: 'DRAWING',
          drawerId: ACCOUNT_ID,
          startedBy: ACCOUNT_ID,
          turnsDone: 0,
          maxTurns: 6,
          finishedEarly: false,
          savedMemoryId: null,
          strokes:
            body?.starter === 'BLANK'
              ? []
              : [
                  {
                    turn: 0,
                    authorId: null,
                    colour: 'INK',
                    points: [140, 500, 300, 380, 500, 520, 700, 400, 860, 500],
                  },
                ],
          updatedAt: TEST_NOW,
        };
      }
      await fulfillJson({ picture });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/games/picture-ping-pong/turns`
    ) {
      const body = request.postDataJSON() as {
        turnsDone: number;
        strokes: Array<{ colour: string; points: number[] }>;
      };
      turnRequests.push(body);
      picture = {
        ...picture,
        turnsDone: picture.turnsDone + 1,
        drawerId: PARTNER_ID,
        strokes: [
          ...picture.strokes,
          ...body.strokes.map((stroke) => ({
            turn: picture.turnsDone + 1,
            authorId: ACCOUNT_ID,
            ...stroke,
          })),
        ],
      };
      await fulfillJson({ picture });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/games/picture-ping-pong/finish`
    ) {
      picture = { ...picture, status: 'FINISHED', drawerId: null };
      await fulfillJson({ picture });
      return;
    }
    if (
      method === 'GET' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/story/timeline`
    ) {
      await fulfillJson({
        availableYears: [],
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/wishes`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/plans`) {
      await fulfillJson({ hasMore: false, items: [], nextCursor: null });
      return;
    }

    if (
      method === 'POST' &&
      pathname === `/api/v1/spaces/${SPACE_ID}/presence`
    ) {
      await fulfillJson({ state: null });
      return;
    }

    await fulfillJson(
      {
        code: 'E2E_UNEXPECTED_REQUEST',
        detail: `Unexpected request: ${method} ${pathname}`,
        status: 500,
        title: 'Unexpected browser test request',
      },
      500,
    );
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('anna@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

async function drawStroke(page: Page, offset: number): Promise<void> {
  const canvas = page.getByRole('img', { name: games.pingPong.canvasLabel });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing surface is not visible.');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * offset);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, {
    steps: 6,
  });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * offset, {
    steps: 6,
  });
  await page.mouse.up();
}

test.describe('Picture ping-pong (#1907 H3 B)', () => {
  test('start, draw, send, and wait read-only at 390 px', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/games/picture-ping-pong');

    await expect(
      page.getByRole('heading', {
        name: games.entries.pingPong.title,
        level: 1,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: games.pingPong.newPicture }).click();
    await expect(
      page.getByRole('heading', { name: games.pingPong.turnYou }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Send stays unavailable until something is drawn.
    const send = page.getByRole('button', {
      name: localized(games.pingPong.send, { name: 'Alex' }),
    });
    await expect(send).toBeDisabled();
    await drawStroke(page, 0.3);
    await drawStroke(page, 0.7);
    await expect(
      page.getByText(
        localized(games.pingPong.strokesUsed, { count: 2, max: 3 }),
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: games.pingPong.undo }).click();
    await expect(
      page.getByText(
        localized(games.pingPong.strokesUsed, { count: 1, max: 3 }),
      ),
    ).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .include('.pingpong-page')
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('picture-ping-pong-draw-390-light.png'),
      fullPage: true,
    });

    await send.click();
    await expect(
      page.getByRole('heading', {
        name: localized(games.pingPong.turnPartner, { name: 'Alex' }),
      }),
    ).toBeVisible();
    expect(turnRequests).toHaveLength(1);
    expect(turnRequests[0].turnsDone).toBe(0);
    expect(turnRequests[0].strokes).toHaveLength(1);
    // No distance is shared in this scenario: no caption and no hint.
    await expect(page.locator('.pingpong-distance')).toHaveCount(0);
    // Read-only while it is Alex's turn: no tools.
    await expect(
      page.getByRole('button', { name: games.pingPong.undo }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('picture-ping-pong-wait-390-light.png'),
      fullPage: true,
    });

    // Either partner may call it finished; the picture then asks for its name.
    await page
      .getByRole('button', { name: games.pingPong.finishEarly })
      .click();
    await page
      .getByRole('button', { name: games.pingPong.finishConfirmAction })
      .click();
    await expect(
      page.getByRole('heading', { name: games.pingPong.doneTitle }),
    ).toBeVisible();
    // #2048: the name is asked when saving, prefilled with a suggestion.
    await expect(
      page.getByRole('textbox', { name: games.pingPong.titleLegend }),
    ).not.toHaveValue('');
    await expect(
      page
        .getByRole('group', { name: games.pingPong.nameSuggestions })
        .getByRole('button'),
    ).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: games.pingPong.saveToMoments }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.screenshot({
      path: testInfo.outputPath('picture-ping-pong-done-390-dark.png'),
      fullPage: true,
    });
  });

  test('the stage shows both profile pictures instead of initials', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page, { avatars: true });
    await page.goto('/login');
    await signIn(page);
    await page.goto('/games/picture-ping-pong');

    const avatars = page.locator('.pingpong-stage .pingpong-avatar img');
    await expect(avatars).toHaveCount(2);
    for (const avatar of await avatars.all()) {
      await expect(avatar).toHaveJSProperty('complete', true);
      expect(
        await avatar.evaluate(
          (node) => (node as HTMLImageElement).naturalWidth,
        ),
      ).toBe(1);
    }
  });

  test('a blank start and the partner’s turn arriving live at 390 px', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/games/picture-ping-pong');

    // The squiggle stays the default; the blank page is one tap away.
    const squiggle = page.getByRole('radio', {
      name: new RegExp(games.pingPong.starterSquiggle),
    });
    await expect(squiggle).toBeChecked();
    await page
      .getByRole('radio', { name: new RegExp(games.pingPong.starterBlank) })
      .check();
    await expectNoHorizontalOverflow(page);
    const axe = await new AxeBuilder({ page })
      .include('.pingpong-page')
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('picture-ping-pong-starter-390-light.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: games.pingPong.newPicture }).click();
    await expect(
      page.getByRole('heading', { name: games.pingPong.turnYou }),
    ).toBeVisible();
    expect(startRequests).toEqual([{ starter: 'BLANK' }]);
    await expect(page.locator('.pingpong-stroke')).toHaveCount(0);

    await drawStroke(page, 0.4);
    await page
      .getByRole('button', {
        name: localized(games.pingPong.send, { name: 'Alex' }),
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: localized(games.pingPong.turnPartner, { name: 'Alex' }),
      }),
    ).toBeVisible();

    // Alex draws and hands back while this page stays open: no reload.
    picture = {
      ...picture,
      turnsDone: picture.turnsDone + 1,
      drawerId: ACCOUNT_ID,
      strokes: [
        ...picture.strokes,
        {
          turn: picture.turnsDone + 1,
          authorId: PARTNER_ID,
          colour: 'PERSON',
          points: [200, 800, 500, 700, 800, 800],
        },
      ],
    };
    await expect(
      page.getByRole('heading', { name: games.pingPong.turnYou }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.pingpong-stroke')).toHaveCount(2);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.screenshot({
      path: testInfo.outputPath('picture-ping-pong-live-390-dark.png'),
      fullPage: true,
    });
  });

  test('the shelf lists the game and expanded keeps one bounded column', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installApiMocks(page);
    await page.goto('/login');
    await signIn(page);
    await page.goto('/games');
    await page
      .getByRole('link', { name: new RegExp(games.entries.pingPong.title) })
      .click();
    await expect(page).toHaveURL(/\/games\/picture-ping-pong$/);
    await expect(
      page.getByRole('button', { name: games.pingPong.newPicture }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: games.pingPong.newPicture }).click();
    await expect(
      page.getByRole('heading', { name: games.pingPong.turnYou }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('picture-ping-pong-draw-1280-light.png'),
      fullPage: true,
    });
  });
});
