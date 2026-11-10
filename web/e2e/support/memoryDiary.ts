import { expect, type Page } from '@playwright/test';
import contextTags from '../../src/i18n/locales/contextTags';
import de from '../../src/i18n/locales/de';
import experiences from '../../src/i18n/locales/experiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import { expectNaturalTextReflow } from './addAction';

/** Open optional tag writing through the same visible Add action as a person. */
export async function showContextTags(page: Page): Promise<void> {
  const input = page.getByLabel(contextTags.newLabel, { exact: true });
  if (!(await input.isVisible())) {
    const tool = page
      .locator('.composer-tool-row button')
      .filter({ has: page.locator('.eimir-icon-tag') });
    await tool
      .or(page.getByRole('button', { name: contextTags.add, exact: true }))
      .first()
      .click();
  }
  await expect(input).toBeVisible();
}

export async function showMemoryDetails(page: Page): Promise<void> {
  if (await page.locator('.page-composer').count()) return;
  await showContextTags(page);
}

/** Finish only the optional tag task; its controlled draft remains with the parent. */
export async function closeContextTags(page: Page): Promise<void> {
  const sheet = page.locator('dialog.composer-tag-sheet');
  if (!(await sheet.isVisible())) return;
  await sheet
    .getByRole('button', { name: experiences.finish, exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
}

/** Suggestions are already disclosed inside the bounded tag sheet. */
export async function showContextSuggestions(page: Page): Promise<void> {
  const details = page.locator('.context-tag-suggestions');
  if ((await details.getAttribute('open')) === null)
    await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
}

export async function closeHeartAudience(page: Page): Promise<void> {
  const sheet = page.locator('dialog.composer-audience-sheet');
  if (await sheet.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    return;
  }
  const details = page.locator('.composer-audience[open]');
  if (await details.count()) await details.locator('summary').click();
}

/** Feeling choices stay immediately visible in page composers; older owners can disclose. */
export async function showHeartEmotions(page: Page): Promise<void> {
  const summary = page.locator('.heart-emotion-disclosure > summary');
  if (await summary.count()) {
    const expanded = page.locator('.heart-emotion-disclosure[open]');
    if (!(await expanded.count())) await summary.click();
  }
  await expect(page.locator('.heart-emotion-picker-grid')).toBeVisible();
}

/** A bounded Place task keeps the same editor behind its localized toolbar entry. */
export async function openComposerPlace(page: Page): Promise<void> {
  const tool = page
    .locator('.composer-tool-row button')
    .filter({ has: page.locator('.eimir-icon-orte') });
  await tool
    .or(page.getByRole('button', { name: photoPlaces.add, exact: true }))
    .first()
    .click();
}

/** Compact context opens an actual labelled native date field in its task. */
export async function showComposerDate(
  page: Page,
  label = de.memory.dateLabel,
) {
  const input = page
    .getByLabel(label, { exact: true })
    .and(page.locator('input'));
  if (!(await input.isVisible())) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page
      .getByRole('button', { name: new RegExp(`^${escaped}:`) })
      .click();
  }
  await expect(input).toBeVisible();
  return input;
}

export async function closeComposerDate(
  page: Page,
  label = de.memory.dateLabel,
) {
  const task = page.getByRole('dialog', { name: label, exact: true });
  await task
    .getByRole('button', { name: experiences.finish, exact: true })
    .click();
  await expect(task).toHaveCount(0);
}

export async function setComposerDate(
  page: Page,
  value: string,
  label = de.memory.dateLabel,
) {
  const input = await showComposerDate(page, label);
  await input.fill(value);
  await expect(input).toHaveValue(value);
  await closeComposerDate(page, label);
}

export async function expectComposerDate(
  page: Page,
  value: string,
  label = de.memory.dateLabel,
) {
  await expect(await showComposerDate(page, label)).toHaveValue(value);
  await closeComposerDate(page, label);
}

/** Audience radios retain their native keyboard behavior in their choice task. */
export async function showHeartAudience(page: Page) {
  const disclosure = page.locator('.composer-audience');
  const button = disclosure.getByRole('button');
  if (await button.count()) {
    const sheet = page.locator('dialog.composer-audience-sheet');
    if (!(await sheet.isVisible())) await button.click();
    await expect(sheet).toBeVisible();
    return sheet;
  }
  if (!(await disclosure.locator('fieldset').isVisible()))
    await disclosure.locator('summary').click();
  await expect(disclosure.locator('fieldset')).toBeVisible();
  return disclosure;
}

export async function showPlanSchedule(page: Page) {
  const trigger = page.locator('.composer-schedule-trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true')
    await trigger.click();
  const task = page.getByRole('dialog', {
    name: m5s3.plan.schedule,
    exact: true,
  });
  await expect(task).toBeVisible();
  return task;
}

export async function closePlanSchedule(page: Page) {
  const task = page.getByRole('dialog', {
    name: m5s3.plan.schedule,
    exact: true,
  });
  await task
    .getByRole('button', { name: experiences.finish, exact: true })
    .click();
  await expect(task).toHaveCount(0);
}

export async function expectReadableComposerHeader(page: Page) {
  const header = page.locator('.composer-header');
  const heading = header.locator('h1');
  await expectNaturalTextReflow(heading, 3);
  await expect(header.locator('.task-back-control')).toBeInViewport();
  await expect(header.locator('button[type="submit"]')).toBeInViewport();
}
