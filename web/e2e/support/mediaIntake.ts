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
  const device = await action.evaluate((element) =>
    element.classList.contains('media-intake-device'),
  );
  await expect(action).toHaveCSS(
    'justify-content',
    device ? 'center' : 'flex-start',
  );
  const geometry = await action.evaluate((element) => {
    let parent = element.parentElement;
    while (parent && getComputedStyle(parent).display === 'contents')
      parent = parent.parentElement;
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
    let expected = /^#[a-f\d]{6}$/i.test(token)
      ? `rgb(${[1, 3, 5].map((start) => Number.parseInt(token.slice(start, start + 2), 16)).join(', ')})`
      : token;
    if (
      element.closest('.photo-source-sheet') &&
      document.querySelector('.heart-emotion-page')
    ) {
      const sample = document.createElement('span');
      sample.style.backgroundColor =
        'color-mix(in srgb, var(--active-heart-emotion-accent) 8%, var(--active-heart-emotion-surface))';
      element.append(sample);
      expected = getComputedStyle(sample).backgroundColor;
      sample.remove();
    }
    return {
      width: bounds.width,
      height: bounds.height,
      parentClass: parent.className,
      parentDisplay: parentStyle.display,
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
  else
    expect(
      Math.abs(geometry.width - geometry.parentWidth),
      JSON.stringify(geometry),
    ).toBeLessThan(1);
  expect(geometry.background).toBe(geometry.expected);
  const icon = action.locator(`.media-intake-icon .eimir-icon-${iconName}`);
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute('aria-hidden', 'true');
  await expect(icon).toHaveAttribute('focusable', 'false');
}

/**
 * The combined Core entry owns the modal; source buttons stay in its sheet.
 * Heart moments and Plans open it from the photo tool, a populated gallery
 * from its add tile, and the diary intake opens it when an external source is
 * connected (#1790 D1).
 */
export async function openComposerMediaSources(page: Page) {
  const tool = page
    .locator('.composer-tool-row button')
    .filter({ has: page.locator('.eimir-icon-foto') });
  await tool
    .or(
      page.getByRole('button', {
        name: photoSources.addMedia,
        exact: true,
      }),
    )
    .or(page.locator('.composer-diary-intake [aria-haspopup="dialog"]'))
    .first()
    .click();
  const sheet = page.getByRole('dialog', {
    name: new RegExp(`^(${photoSources.title}|${photoSources.addMedia})$`),
    exact: true,
  });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Adds files through the composer's photo entry. Without an external source
 * the diary intake opens the device picker directly (#1790 D1); every other
 * entry goes through the shared source sheet.
 */
export async function addComposerMedia(
  page: Page,
  files: Parameters<Locator['setInputFiles']>[0],
) {
  const directIntake = page.locator(
    '.composer-diary-intake .media-intake-device:not([aria-haspopup="dialog"])',
  );
  if (await directIntake.isVisible()) {
    await page
      .locator(
        '.composer-diary-intake .media-device-choice:not(.media-device-choice--chooser) input[type="file"]',
      )
      .setInputFiles(files);
    return;
  }
  const sheet = await openComposerMediaSources(page);
  await page
    .locator('.media-device-choice--chooser input[type=file]')
    .setInputFiles(files);
  await expect(sheet).toHaveCount(0);
}
