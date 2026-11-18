import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Every single-item detail page offers Edit and Delete through one actions
 * menu: a three-dot button in the page header that opens a sheet (a centered
 * dialog on Expanded) with Edit first and Delete last. Specs go through these
 * helpers instead of looking for a separate Edit link or a delete control.
 */

/** The three-dot button of the page's item actions menu. */
export function itemMenuTrigger(page: Page): Locator {
  return page.locator('.item-menu-trigger');
}

/** A row of the open menu, matched by its visible title. */
export function itemMenuRow(page: Page, title: string | RegExp): Locator {
  return page.locator('.item-menu-option').filter({ hasText: title }).first();
}

/** Opens the item actions menu. */
export async function openItemMenu(page: Page): Promise<void> {
  await itemMenuTrigger(page).click();
}

/** Opens the menu and chooses a row by its title (the localized label). */
export async function chooseItemMenuRow(
  page: Page,
  title: string | RegExp,
): Promise<void> {
  await openItemMenu(page);
  await itemMenuRow(page, title).click();
}

/**
 * Edit through the menu; `editLabel` is the localized "Edit" text. Returns
 * once the menu sheet is gone, so the next step never meets its dialog.
 */
export async function editViaMenu(
  page: Page,
  editLabel: string | RegExp,
): Promise<void> {
  await chooseItemMenuRow(page, editLabel);
  await expect(page.locator('.item-menu')).toHaveCount(0);
}

/** Delete through the menu; confirmation is a separate step of the spec. */
export async function deleteViaMenu(
  page: Page,
  deleteLabel: string | RegExp,
): Promise<void> {
  await chooseItemMenuRow(page, deleteLabel);
}
