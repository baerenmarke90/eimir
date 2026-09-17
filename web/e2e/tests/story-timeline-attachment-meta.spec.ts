import { expect, type Page, test } from '@playwright/test';
import de from '../../src/i18n/locales/de';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

const LEA = { id: ACCOUNT_ID, displayName: 'Lea Sommer' };
const CAPABILITIES = { canEdit: true, canDelete: true, canComment: true };

async function installMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
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
        account: { displayName: 'Lea Sommer', id: ACCOUNT_ID },
        tokens: {
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
          accessToken: 'timeline-meta-access-token',
          refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
          refreshToken: 'timeline-meta-refresh-token',
        },
      });
      return;
    }
    if (method === 'GET' && pathname === '/api/v1/auth/me') {
      await fulfillJson({ displayName: 'Lea Sommer', id: ACCOUNT_ID });
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
        createdAt: '2023-06-17T00:00:00Z',
        partners: [LEA],
      });
      return;
    }
    if (method === 'GET' && pathname === `/api/v1/spaces/${SPACE_ID}/profile`) {
      await fulfillJson({
        spaceId: SPACE_ID,
        version: 1,
        relationshipStartedOn: '2023-06-17',
        showRelationshipDuration: true,
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
      pathname === `/api/v1/spaces/${SPACE_ID}/profiles/${ACCOUNT_ID}`
    ) {
      await fulfillJson({
        accountId: ACCOUNT_ID,
        createdAt: '2023-06-17T00:00:00Z',
        displayName: 'Lea Sommer',
        id: PROFILE_ID,
        preferences: [],
        profileAttachmentId: null,
        updatedAt: '2023-06-17T00:00:00Z',
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
      pathname === `/api/v1/spaces/${SPACE_ID}/timeline`
    ) {
      await fulfillJson({
        items: [
          {
            kind: 'MEMORY',
            effectiveDate: '2026-08-24',
            memory: {
              id: 'mem-1',
              title: 'Ein Wochenende am Wasser',
              happenedOn: '2026-08-24',
              createdAt: '2026-08-24',
              author: LEA,
              capabilities: CAPABILITIES,
              attachments: [
                {
                  id: 'a1',
                  position: 0,
                  status: 'READY',
                  mediaType: 'IMAGE',
                  mimeType: 'image/jpeg',
                  hasThumbnail: true,
                  width: 800,
                  height: 800,
                  size: 1,
                },
                {
                  id: 'a2',
                  position: 1,
                  status: 'READY',
                  mediaType: 'IMAGE',
                  mimeType: 'image/jpeg',
                  hasThumbnail: true,
                  width: 800,
                  height: 800,
                  size: 1,
                },
              ],
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
      });
      return;
    }
    await fulfillJson({}, 200);
  });
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel(de.login.email).fill('lea@example.org');
  await page.getByLabel(de.login.password).fill('a-long-enough-test-password');
  await page.getByRole('button', { name: de.login.submit }).click();
  await expect(page.getByLabel(de.login.email)).toHaveCount(0);
}

/**
 * "2 Fotos" previously rendered bold and in the brand "shared" accent
 * color, making the attachment count look like an emphasized display
 * number rather than quiet secondary metadata next to the date/author
 * (#791 second follow-up). It must now match the muted, regular-weight
 * treatment of the neighboring date and author text.
 */
test('Timeline attachment-count meta ("2 Fotos") matches the surrounding secondary metadata typography', async ({
  page,
}) => {
  await installMocks(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/story?tab=timeline');
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await page.waitForSelector('.media-label');

  const [mediaLabelStyle, dateStyle] = await Promise.all([
    page
      .locator('.media-label')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
        };
      }),
    page
      .locator('.story-card-footer time')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
        };
      }),
  ]);

  expect(mediaLabelStyle).toEqual(dateStyle);
});

const CAPABILITIES_ALL = CAPABILITIES;

function memoryItem(
  id: string,
  title: string,
  happenedOn: string,
  photos: number,
) {
  return {
    kind: 'MEMORY',
    effectiveDate: happenedOn,
    memory: {
      id,
      title,
      happenedOn,
      createdAt: happenedOn,
      author: LEA,
      capabilities: CAPABILITIES_ALL,
      attachments: Array.from({ length: photos }, (_, index) => ({
        id: `${id}-a${index}`,
        position: index,
        status: 'READY',
        mediaType: 'IMAGE',
        mimeType: 'image/jpeg',
        hasThumbnail: true,
        width: 800,
        height: 800,
        size: 1,
      })),
    },
  };
}

/**
 * One card per attachment shape the Timeline can render, so the footer's
 * single base authority is exercised against all of them (#795).
 */
const FOOTER_VARIANTS = [
  memoryItem('mem-none', 'Ein ruhiger Sonntagmorgen', '2026-08-28', 0),
  memoryItem('mem-one', 'Ein Jahr in unserer Wohnung', '2026-08-27', 1),
  memoryItem('mem-many', 'Ein Wochenende am Wasser', '2026-08-24', 3),
  {
    kind: 'HEART_MOMENT',
    effectiveDate: '2026-08-22',
    heartMoment: {
      id: 'hm-1',
      text: 'Kurz an dich gedacht.',
      emotion: 'LOVED',
      happenedOn: '2026-08-22',
      createdAt: '2026-08-22',
      author: LEA,
      capabilities: CAPABILITIES_ALL,
      attachment: {
        id: 'hm-1-a',
        position: 0,
        status: 'READY',
        mediaType: 'IMAGE',
        mimeType: 'image/jpeg',
        hasThumbnail: true,
        width: 800,
        height: 800,
        size: 1,
      },
    },
  },
  {
    kind: 'MILESTONE',
    effectiveDate: '2026-08-20',
    milestone: {
      id: 'ms-1',
      title: 'Drei Jahre',
      happenedOn: '2026-08-20',
      createdAt: '2026-08-20',
      author: LEA,
      capabilities: CAPABILITIES_ALL,
    },
  },
];

async function installFooterVariants(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/v1/spaces/${SPACE_ID}/timeline`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: FOOTER_VARIANTS,
          hasMore: false,
          nextCursor: null,
        }),
      });
    },
  );
}

async function openTimeline(page: Page): Promise<void> {
  await page.goto('/story?tab=timeline');
  await signIn(page);
  await page.goto('/story?tab=timeline');
  await page.waitForSelector('.story-card-footer');
}

/**
 * `.story-card-footer` used to be declared as a base rule in four places
 * (`styles.css`, `StoryProductPages.css`, `StoryListPolish.css` and a Memory
 * Detail media query in `MemoryProductPage.css`). They had equal or
 * overlapping specificity, so load order rather than intent decided the
 * rendered footer. #795 consolidated that onto one owner; this guards it.
 */
test('the Timeline card footer has exactly one unconditional base rule (#795)', async ({
  page,
}) => {
  await installMocks(page);
  await installFooterVariants(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openTimeline(page);

  const baseRules = await page.evaluate(() => {
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = (sheet as CSSStyleSheet).cssRules;
      } catch {
        continue;
      }
      // Only top-level rules count as the base; media-query variants are a
      // legitimate part of the single owner's responsive behaviour.
      for (const rule of Array.from(rules)) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText.trim() === '.story-card-footer'
        ) {
          found.push(rule.cssText);
        }
      }
    }
    return found;
  });

  expect(baseRules).toHaveLength(1);
});

test('Timeline footer metadata stays coherent across attachment shapes (#795)', async ({
  page,
}) => {
  await installMocks(page);
  await installFooterVariants(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openTimeline(page);

  const footers = await page.evaluate(() => {
    const read = (el: Element) => {
      const cs = getComputedStyle(el);
      return {
        color: cs.color,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
      };
    };
    return Array.from(document.querySelectorAll('.story-card-footer')).map(
      (footer) => {
        const time = footer.querySelector('time');
        const mediaLabel = footer.querySelector('.media-label');
        return {
          base: read(footer),
          borderTop: getComputedStyle(footer).borderTopWidth,
          time: time ? read(time) : null,
          mediaLabel: mediaLabel ? read(mediaLabel) : null,
        };
      },
    );
  });

  expect(footers).toHaveLength(FOOTER_VARIANTS.length);

  // Every card resolves the same footer base, whatever it contains.
  const bases = new Set(footers.map((footer) => JSON.stringify(footer.base)));
  expect(bases.size).toBe(1);
  for (const footer of footers) {
    expect(footer.borderTop).toBe('1px');
    // Date and attachment count read as one muted metadata pair.
    if (footer.mediaLabel) expect(footer.mediaLabel).toEqual(footer.time);
  }

  // The Memory without attachments states no count at all.
  expect(footers[0].mediaLabel).toBeNull();
  expect(footers[1].mediaLabel).not.toBeNull();
  expect(footers[2].mediaLabel).not.toBeNull();
});

/**
 * The compact footer used to stack date above author. Since #969 it is one
 * wrapping row everywhere: date first, the author/visibility/photo group
 * after it, moving to a second row only when it no longer fits.
 */
test('Timeline footer is one wrapping row on compact widths (#795, #969)', async ({
  page,
}) => {
  await installMocks(page);
  await installFooterVariants(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTimeline(page);

  const layout = await page
    .locator('.story-card-footer')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { flexDirection: cs.flexDirection, flexWrap: cs.flexWrap };
    });

  expect(layout.flexDirection).toBe('row');
  expect(layout.flexWrap).toBe('wrap');
});
