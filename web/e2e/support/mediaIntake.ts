import { expect, type Locator, type Page } from '@playwright/test';
import type { EimirIconName } from '../../src/components/EimirIcon';
import photoSources from '../../src/i18n/locales/photoSources';

/** Source choices fill their group and keep a soft surface distinct from AddAction. */
export async function expectMediaIntakeAction(
  action: Locator,
  iconName: EimirIconName,
) {
  await expect(action).toBeVisible();
  // Compare the idle surface rather than whichever row the previous pointer hit.
  await action.page().mouse.move(0, 0);
  const label = action.locator('.media-intake-label');
  await expect(label).toBeVisible();
  await expect(action).toHaveAccessibleName(await label.innerText());
  await expect(action).toHaveAttribute('type', 'button');
  await expect(action).toHaveCSS('border-top-width', '0px');
  await expect(action).toHaveCSS('justify-content', 'flex-start');
  const geometry = await action.evaluate((element) => {
    const parent = element.parentElement;
    if (!parent) throw new Error('The source choice is detached.');
    const style = getComputedStyle(element);
    const parentStyle = getComputedStyle(parent);
    const bounds = element.getBoundingClientRect();
    const entry = element.classList.contains('media-intake-entry');
    const token = style
      .getPropertyValue(
        entry || element.closest('.photo-source-sheet')
          ? '--color-surface-panel-tint'
          : '--color-surface',
      )
      .trim();
    const expected = /^#[a-f\d]{6}$/i.test(token)
      ? `rgb(${[1, 3, 5].map((start) => Number.parseInt(token.slice(start, start + 2), 16)).join(', ')})`
      : token;
    return {
      width: bounds.width,
      height: bounds.height,
      parentWidth:
        parent.clientWidth -
        parseFloat(parentStyle.paddingInlineStart) -
        parseFloat(parentStyle.paddingInlineEnd),
      background: style.backgroundColor,
      expected,
      entry,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(48);
  if (geometry.entry)
    expect(geometry.width).toBeLessThanOrEqual(geometry.parentWidth);
  else expect(Math.abs(geometry.width - geometry.parentWidth)).toBeLessThan(1);
  expect(geometry.background).toBe(geometry.expected);
  const icon = action.locator(`.media-intake-icon .eimir-icon-${iconName}`);
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute('aria-hidden', 'true');
  await expect(icon).toHaveAttribute('focusable', 'false');
}

/** The combined Core entry owns the modal; source buttons stay in its sheet. */
export async function openComposerMediaSources(page: Page) {
  await page
    .getByRole('button', { name: photoSources.addMedia, exact: true })
    .click();
  const sheet = page.getByRole('dialog', {
    name: photoSources.addMedia,
    exact: true,
  });
  await expect(sheet).toBeVisible();
  return sheet;
}
