import { expect, type Page } from '@playwright/test';
import contextTags from '../../src/i18n/locales/contextTags';
import de from '../../src/i18n/locales/de';
import experiences from '../../src/i18n/locales/experiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import { expectNaturalTextReflow } from './addAction';

/** Open optional tag writing through the same visible Add action as a person. */
export async function showContextTags(page: Page): Promise<void> {
  const input = page.getByLabel(contextTags.newLabel, { exact: true });
  if (!(await input.isVisible()))
    await page
      .getByRole('button', { name: contextTags.add, exact: true })
      .click();
  await expect(input).toBeVisible();
}

export async function showMemoryDetails(page: Page): Promise<void> {
  await showContextTags(page);
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

/** Audience radios retain their native keyboard behavior inside disclosure. */
export async function showHeartAudience(page: Page) {
  const disclosure = page.locator('.composer-audience');
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
