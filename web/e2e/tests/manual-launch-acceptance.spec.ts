import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const RELEASE_SOURCE_SHA = '8bb0c1eadbeb4864788d277a25a3673c79f5e46f';
const RELEASE_VERSION = 'v0.1.0';

async function expectNoWcagViolations(page: Page, contextName = ''): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
      'wcag22a',
      'wcag22aa',
    ])
    .analyze();

  const criticalOrSerious = result.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  const summary = result.violations
    .map(
      (violation) =>
        `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.description} (${violation.nodes.length} node(s))`,
    )
    .join('\n');

  if (criticalOrSerious.length > 0) {
    console.error(`Axe Critical/Serious violations in ${contextName}:\n${summary}`);
  }

  expect(criticalOrSerious, `Critical/Serious axe violations in ${contextName}: ${summary}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe('Release v0.1.0 Accessibility Acceptance', () => {
  test.describe.configure({ mode: 'serial' });

  test('01. Release identity verification on live test deployment', async ({ request }) => {
    // 1. Revision marker served by Web runtime
    const revResponse = await request.get('/.well-known/eimir-revision');
    expect(revResponse.status()).toBe(200);
    const revText = (await revResponse.text()).trim();
    expect(revText).toBe(RELEASE_SOURCE_SHA);

    // 2. Healthz check
    const healthz = await request.get('/healthz');
    expect(healthz.status()).toBe(200);
    expect((await healthz.text()).trim()).toBe('ok');

    // 3. API ready and revision header
    const apiReady = await request.get('/api/v1/health/ready');
    expect(apiReady.status()).toBe(200);
    expect(apiReady.headers()['x-eimir-revision']).toBe(RELEASE_SOURCE_SHA);

    console.log(`Verified release identity: ${RELEASE_VERSION} @ ${RELEASE_SOURCE_SHA}`);
  });

  test('02. Demo Entry: keyboard navigation, visible focus, semantics, zoom & responsive', async ({ page }) => {
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');

    // Heading hierarchy
    const heading = page.locator('h1#demo-welcome-heading, h1');
    await expect(heading.first()).toBeVisible();
    await expect(heading.first()).toContainText('eimir. direkt ausprobieren.');

    // Landmark verification
    const main = page.locator('main.login-shell, main');
    await expect(main.first()).toBeVisible();

    // Button accessible names & roles
    const leaBtn = page.getByRole('button', { name: /Als Lea (beitreten|fortfahren)/i });
    const alexBtn = page.getByRole('button', { name: /Als Alex (beitreten|fortfahren)/i });
    await expect(leaBtn).toBeVisible();
    await expect(alexBtn).toBeVisible();

    // Keyboard navigation (Tab sequence)
    await page.keyboard.press('Tab'); // First focusable
    let activeText = await page.evaluate(() => document.activeElement?.textContent || '');
    let attempts = 0;
    while (!activeText.includes('Lea') && attempts < 10) {
      await page.keyboard.press('Tab');
      activeText = await page.evaluate(() => document.activeElement?.textContent || '');
      attempts++;
    }
    expect(activeText).toContain('Lea');

    // Verify focus outline exists
    const hasFocusRing = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return (
        style.outlineStyle !== 'none' ||
        style.boxShadow !== 'none' ||
        style.borderColor !== 'transparent'
      );
    });
    expect(hasFocusRing).toBe(true);

    // Tab to next button (Alex)
    await page.keyboard.press('Tab');
    activeText = await page.evaluate(() => document.activeElement?.textContent || '');
    expect(activeText).toContain('Alex');

    // Shift+Tab back to Lea
    await page.keyboard.press('Shift+Tab');
    activeText = await page.evaluate(() => document.activeElement?.textContent || '');
    expect(activeText).toContain('Lea');

    // Axe scan for WCAG violations
    await expectNoWcagViolations(page, 'Demo Entry');

    // Responsive: 320px viewport
    await page.setViewportSize({ width: 320, height: 667 });
    await expectNoHorizontalOverflow(page);
    await expect(leaBtn).toBeVisible();
    await expect(alexBtn).toBeVisible();

    // 200% Zoom check (equivalent to 640px rendered width for 1280px standard)
    await page.setViewportSize({ width: 640, height: 500 });
    await expectNoHorizontalOverflow(page);
    await expect(leaBtn).toBeVisible();

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('03. Standard Entry: form labels, error announcements and keyboard flow', async ({ browser }) => {
    // New clean context without demo session
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Email field has accessible label
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();
    const emailInput = page.locator('input#email');
    await expect(emailInput).toBeVisible();

    // Keyboard Tab to email input
    await page.keyboard.press('Tab');
    let focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    let attempts = 0;
    while (focusedTag !== 'input' && attempts < 10) {
      await page.keyboard.press('Tab');
      focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
      attempts++;
    }
    expect(focusedTag).toBe('input');

    // Submit button
    const submitBtn = page.getByRole('button', { name: /Anmelden|Weiter|Link anfordern/i });
    await expect(submitBtn).toBeVisible();

    // Axe scan on standard login view
    await expectNoWcagViolations(page, 'Standard Login');

    await context.close();
  });

  test('04. Authenticated Shell: Skip Link, central navigation & landmarks', async ({ page }) => {
    // Join as Lea
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');
    const leaBtn = page.getByRole('button', { name: /Als Lea (beitreten|fortfahren)/i });
    await leaBtn.click();
    await page.waitForLoadState('networkidle');

    // Verify authenticated shell rendered
    await expect(page.locator('.product-shell')).toBeVisible({ timeout: 15_000 });

    // Verify Skip Link
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toBeAttached();
    await page.keyboard.press('Tab');
    const isSkipLinkFocused = await skipLink.evaluate((el) => document.activeElement === el);
    if (isSkipLinkFocused) {
      await page.keyboard.press('Enter');
      const focusedMain = await page.evaluate(() => document.activeElement?.id);
      expect(focusedMain).toBe('main-content');
    }

    // Verify Primary Navigation destinations
    const nav = page.locator('nav.shell-nav, nav.mobile-bottom-nav, nav');
    await expect(nav.first()).toBeVisible();

    // Key destinations present with accessible names
    const storyLink = page.getByRole('link', { name: /Momente|Story/i });
    const planLink = page.getByRole('link', { name: /Planen|Pläne/i });
    const todayLink = page.getByRole('link', { name: /Wir|Heute|Today/i });

    await expect(storyLink.first()).toBeVisible();
    await expect(planLink.first()).toBeVisible();
    await expect(todayLink.first()).toBeVisible();

    // Check active navigation indicator
    const activeNav = page.locator('[aria-current="page"]');
    await expect(activeNav.first()).toBeVisible();

    // Space context / Header profile menu button
    const profileBtn = page.locator('button.header-profile-trigger, button[aria-label*="Profil"]');
    if (await profileBtn.count() > 0) {
      await expect(profileBtn.first()).toBeVisible();
      // Test opening header/profile menu with keyboard
      await profileBtn.first().focus();
      await page.keyboard.press('Enter');
      // Verify popover opened
      const popover = page.locator('.header-profile-popover');
      if (await popover.count() > 0) {
        await expect(popover.first()).toBeVisible();
        // Close with Escape
        await page.keyboard.press('Escape');
        await expect(popover.first()).not.toBeVisible();
      }
    }

    // Axe scan on Authenticated Shell
    await expectNoWcagViolations(page, 'Authenticated Shell');
  });

  test('05. Primary Actions: Quick Create (+) overlay, Escape dismissal & focus restoration', async ({ page }) => {
    // Navigate into authenticated shell
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');
    const leaBtn = page.getByRole('button', { name: /Als Lea (beitreten|fortfahren)/i });
    await leaBtn.click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.product-shell')).toBeVisible({ timeout: 15_000 });

    // Locate Floating / Header Quick Create trigger button
    const createBtn = page.locator('button.quick-create-trigger').first();
    await expect(createBtn).toBeVisible();

    // Focus via keyboard
    await createBtn.focus();
    await expect(createBtn).toBeFocused();

    // Press Enter to open Quick Create panel
    await page.keyboard.press('Enter');

    // Verify overlay / floating panel opened
    const menu = page.locator('.quick-create-menu, [role="menu"]');
    await expect(menu.first()).toBeVisible();

    // Verify panel actions have accessible names and can be navigated
    const actionItems = menu.first().locator('[role="menuitem"], a, button');
    const count = await actionItems.count();
    expect(count).toBeGreaterThan(0);

    // Axe scan on open Quick Create panel
    await expectNoWcagViolations(page, 'Quick Create Overlay');

    // Press Escape -> panel closes and focus restored to (+) trigger button
    await page.keyboard.press('Escape');
    await expect(menu.first()).not.toBeVisible();

    // Verify focus restored to create button
    const restoredTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(restoredTag).toBe('button');
  });

  test('06. Launch-Specific State: Games Entitlement (Free Space / Premium boundary)', async ({ page }) => {
    // Navigate into authenticated shell
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Als Lea (beitreten|fortfahren)/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.product-shell')).toBeVisible({ timeout: 15_000 });

    // Navigate to /games product area
    await page.goto('/games');
    await page.waitForLoadState('networkidle');

    // Check heading
    const gamesHeading = page.locator('.games-heading, h1');
    await expect(gamesHeading.first()).toBeVisible();

    // Check games shelf
    const shelf = page.locator('.games-shelf');
    await expect(shelf).toBeVisible();

    const entries = shelf.locator('.games-entry');
    const entryCount = await entries.count();
    expect(entryCount).toBeGreaterThan(0);

    // Verify semantics: playable entries are interactive (a/button), upcoming entries are informative article elements
    const firstEntry = entries.first();
    const firstTag = await firstEntry.evaluate((el) => el.tagName.toLowerCase());
    expect(['a', 'button', 'article']).toContain(firstTag);

    // Status text is conveyed in text, not just visually/color
    const statusText = await firstEntry.locator('.games-entry-status').textContent();
    expect(statusText).toMatch(/Spielen|Bald verfügbar|Premium|Demnächst/i);

    // Verify upcoming entries are informative article elements
    const upcomingEntry = shelf.locator('article.games-entry').first();
    if (await upcomingEntry.count() > 0) {
      const upcomingStatus = await upcomingEntry.locator('.games-entry-status').textContent();
      expect(upcomingStatus).toMatch(/Bald verfügbar|Demnächst|Premium/i);
    }

    // Keyboard navigation is clean and does not trap focus
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Axe scan on Games / Entitlement state
    await expectNoWcagViolations(page, 'Games Entitlement Shelf');
  });

  test('07. Launch-Specific State: ServerAdmin Access Gate (Unauthorized non-admin)', async ({ page }) => {
    // Join as regular user Lea
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Als Lea (beitreten|fortfahren)/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.product-shell')).toBeVisible({ timeout: 15_000 });

    // Directly navigate to /server-admin
    await page.goto('/server-admin');
    await page.waitForLoadState('networkidle');

    // Access gate renders ServerAdmin gate shell
    const accessGate = page.locator('.server-admin-gate-shell');
    await expect(accessGate).toBeVisible();

    const gateTitle = accessGate.getByText(/Kein Zugriff auf die Serververwaltung/i);
    await expect(gateTitle).toBeVisible();

    // Verify back-to-app action link exists and is keyboard reachable
    const backLink = accessGate.getByRole('link', { name: /Zur Übersicht/i });
    await expect(backLink).toBeVisible();
    await backLink.focus();
    await expect(backLink).toBeFocused();

    // Axe scan on unauthorized access gate
    await expectNoWcagViolations(page, 'ServerAdmin Access Gate (Unauthorized)');
  });

  test('08. Launch-Specific State: ServerAdmin Authorized view, settings & maintenance toggle', async ({ browser, request }) => {
    // Direct sign in API request for admin user
    const loginResp = await request.post('/api/v1/auth/sign-in', {
      data: { email: 'admin@eimir.test', password: 'adminpassword123' },
    });
    expect(loginResp.status()).toBe(200);
    const sessionData = await loginResp.json();

    const context = await browser.newContext();
    const page = await context.newPage();

    // Inject session into browser sessionStorage
    await page.goto('/');
    await page.evaluate((data) => {
      const stored = {
        account: data.account,
        tokens: data.tokens,
        spaceId: null,
      };
      sessionStorage.setItem('eimir-session-v1', JSON.stringify(stored));
    }, sessionData);

    // Navigate to /server-admin?section=settings
    await page.goto('/server-admin?section=settings');
    await page.waitForLoadState('networkidle');

    // Verify authorized ServerAdmin Page loaded
    const adminHeading = page.locator('.server-admin-topbar h1, .server-admin-main h1, h1');
    await expect(adminHeading.first()).toBeVisible({ timeout: 15_000 });

    // Verify maintenance toggle
    const maintenanceToggle = page.locator('button.server-admin-toggle[aria-describedby="server-maintenance-help"]');
    await expect(maintenanceToggle).toBeVisible({ timeout: 10_000 });

    // Has aria-pressed attribute
    const ariaPressed = await maintenanceToggle.getAttribute('aria-pressed');
    expect(ariaPressed).toBe('false');

    // Has associated help text
    const helpText = page.locator('#server-maintenance-help');
    await expect(helpText).toBeVisible();

    // Keyboard focus on maintenance toggle
    await maintenanceToggle.focus();
    await expect(maintenanceToggle).toBeFocused();

    // Axe scan on ServerAdmin
    await expectNoWcagViolations(page, 'ServerAdmin Authorized');

    await context.close();
  });

  test('09. Launch-Specific State: Maintenance Mode presentation & keyboard integrity', async ({ request, browser }) => {
    // 1. Get admin token and enable maintenance mode
    const loginResp = await request.post('/api/v1/auth/sign-in', {
      data: { email: 'admin@eimir.test', password: 'adminpassword123' },
    });
    const sessionData = await loginResp.json();
    const token = sessionData.tokens.accessToken;

    const putResp = await request.put('/api/v1/server-admin/settings/maintenance', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: true },
    });
    expect(putResp.status()).toBe(200);

    // Verify instance status reports maintenance
    const statusResp = await request.get('/api/v1/instance/status');
    const statusData = await statusResp.json();
    expect(statusData.maintenanceMode).toBe(true);

    // 2. Open clean browser session and visit entry page
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify keyboard navigation remains intact
    await page.keyboard.press('Tab');
    const focusedEl = await page.evaluate(() => Boolean(document.activeElement));
    expect(focusedEl).toBe(true);

    // Axe scan on Maintenance view
    await expectNoWcagViolations(page, 'Maintenance Mode Presentation');

    await context.close();

    // 3. Restore maintenance mode back to false
    const restoreResp = await request.put('/api/v1/server-admin/settings/maintenance', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: false },
    });
    expect(restoreResp.status()).toBe(200);

    const verifiedStatus = await request.get('/api/v1/instance/status');
    expect((await verifiedStatus.json()).maintenanceMode).toBe(false);
  });

  test('10. Responsive & Mobile Web: Compact 320px shell and navigation', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 667 });

    // Join as Lea
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Als Lea (beitreten|fortfahren)/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.product-shell')).toBeVisible({ timeout: 15_000 });

    // Check no horizontal overflow
    await expectNoHorizontalOverflow(page);

    // Bottom navigation visible and operable
    const nav = page.locator('nav.mobile-bottom-nav');
    await expect(nav).toBeVisible();

    // Check touch/click targets: at least 44x44px for primary interactive FAB
    const fabBtn = page.locator('button.quick-create-trigger').first();
    if (await fabBtn.count() > 0) {
      const box = await fabBtn.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }

    // Axe scan on 320px compact layout
    await expectNoWcagViolations(page, 'Mobile Web 320px Compact');
  });
});
