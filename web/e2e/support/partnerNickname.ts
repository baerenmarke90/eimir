import type { Page } from '@playwright/test';
import type { PartnerNicknameView } from '../../src/api/generated/models/PartnerNicknameView';

/** Shared shell metadata for fixtures that do not customize a partner nickname. */
export async function mockEmptyPartnerNickname(
  page: Page,
  spaceId: string,
  partnerId: string | null,
): Promise<void> {
  const response: PartnerNicknameView = {
    nickname: null,
    partnerId,
    version: 0,
  };
  await page.route(`**/api/v1/spaces/${spaceId}/partner-nickname`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: response });
  });
}
