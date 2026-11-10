import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import composer from '../../src/i18n/locales/composer';
import contextTags from '../../src/i18n/locales/contextTags';
import de from '../../src/i18n/locales/de';
import experiences from '../../src/i18n/locales/experiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import mediaDrop from '../../src/i18n/locales/mediaDrop';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import photoReactions from '../../src/i18n/locales/photoReactions';
import photoSources from '../../src/i18n/locales/photoSources';
import sensitiveMedia from '../../src/i18n/locales/sensitiveMedia';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import voiceNotes from '../../src/i18n/locales/voiceNotes';
import { nextFrame, swipeCarousel } from '../support/mediaCarouselGesture';
import { openComposerMediaSources } from '../support/mediaIntake';
import {
  closePlanSchedule,
  expectReadableComposerHeader,
  setComposerDate,
  showContextTags,
  showHeartAudience,
  showPlanSchedule,
} from '../support/memoryDiary';
import {
  pageComposerContent as content,
  installPageComposerFixture,
  pageComposerVoiceInput,
} from '../support/pageComposer';
import { waitForSettledMotion } from '../support/settledMotion';
import { captureScreenshot, signIn } from '../support/storyTimelineFixture';

const photo = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);
const gallery = storyProducts.gallery;

async function noOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          class: element.className.toString(),
          x: rect.x,
          right: rect.right,
          width: rect.width,
        };
      })
      .filter((rect) => rect.width > 0 && rect.right > innerWidth + 1)
      .slice(0, 16),
  }));
  expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(
    geometry.viewport + 1,
  );
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest('.page-composer') &&
      active.matches('textarea, input[name="title"]')
    )
      active.blur();
  });
  await waitForSettledMotion(page);
  const inspectHeader = () =>
    page.locator('.composer-header').evaluateAll((headers) =>
      headers.map((header) => ({
        controls: [...header.querySelectorAll('button, a')].map((control) => {
          const rect = control.getBoundingClientRect();
          const style = getComputedStyle(control);
          const ancestors = [];
          for (
            let parent = control.parentElement;
            parent;
            parent = parent.parentElement
          ) {
            const parentStyle = getComputedStyle(parent);
            ancestors.push({
              class: parent.className,
              opacity: parentStyle.opacity,
              visibility: parentStyle.visibility,
              display: parentStyle.display,
            });
            if (parent === header) break;
          }
          return {
            name: control.getAttribute('aria-label') ?? control.textContent,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            opacity: style.opacity,
            visibility: style.visibility,
            display: style.display,
            color: style.color,
            background: style.backgroundColor,
            animation: style.animation,
            transition: style.transition,
            ancestors,
            animations: control.getAnimations().map((animation) => ({
              state: animation.playState,
              time: animation.currentTime,
              timing: animation.effect?.getComputedTiming(),
            })),
          };
        }),
      })),
    );
  const diagnoseHeader = name === 'plan-edit-frame-10-390-light';
  const beforeHeader = diagnoseHeader ? await inspectHeader() : undefined;
  await noOverflow(page);
  await captureScreenshot(page, info, `1730-${name}.png`, {
    animations: 'disabled',
  });
  if (diagnoseHeader) {
    const diagnostic = JSON.stringify(
      { before: beforeHeader, after: await inspectHeader() },
      null,
      2,
    );
    writeFileSync(info.outputPath(`1730-${name}-header.json`), diagnostic);
    if (process.env.SCREENSHOT_EXPORT_DIR)
      writeFileSync(
        join(process.env.SCREENSHOT_EXPORT_DIR, `1730-${name}-header.json`),
        diagnostic,
      );
  }
  if (info.title.includes('200-percent'))
    await captureScreenshot(page, info, `1730-${name}-full.png`, {
      fullPage: true,
      animations: 'disabled',
    });
}

async function closeChoice(page: Page) {
  const sheet = page.getByRole('dialog').last();
  const done = sheet.getByRole('button', {
    name: experiences.finish,
    exact: true,
  });
  if (await done.count()) await done.click();
  else await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
}

function tool(page: Page, label: string) {
  return page
    .locator('.composer-tool-row')
    .getByRole('button', { name: label, exact: true });
}

async function chooseFeeling(page: Page, label: string) {
  const choice = page.getByRole('radio', { name: label, exact: true });
  await page.locator('.heart-emotion-choice').filter({ has: choice }).click();
  await expect(choice).toBeChecked();
}

async function addPhotos(page: Page) {
  await page
    .locator('input[type="file"][accept*="image/jpeg"]')
    .first()
    .setInputFiles([
      { name: 'lake-one.jpg', mimeType: 'image/jpeg', buffer: photo },
      { name: 'lake-two.jpg', mimeType: 'image/jpeg', buffer: photo },
    ]);
  await expect(page.locator('.photo-draft-tile')).toHaveCount(2);
  for (const tile of await page.locator('.photo-draft-tile').all())
    await expect(tile).toHaveAccessibleName(new RegExp(de.memory.photoReady));
}

async function addPlaceAndTag(page: Page) {
  await tool(page, composer.place).click();
  const places = page.getByRole('dialog').last();
  await places
    .getByLabel(photoPlaces.savedSearch, { exact: true })
    .fill(content.placeName);
  await places
    .getByRole('button', { name: new RegExp(`^${content.placeName}`) })
    .click();
  if (await places.isVisible()) await closeChoice(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: new RegExp(content.placeName) }).first(),
  ).toBeVisible();
  await showContextTags(page);
  const tag = page.getByRole('checkbox', {
    name: new RegExp(`^(?:✓\\s*)?${content.tag}$`),
  });
  if (!(await tag.isChecked())) await tag.click();
  await expect(tag).toBeChecked();
  await closeChoice(page);
  await expect(
    page.getByRole('button', {
      name: composer.editTag.replace('{{name}}', content.tag),
      exact: true,
    }),
  ).toBeVisible();
}

async function addVoice(page: Page) {
  await tool(page, composer.voice).click();
  const source = page.getByRole('dialog', {
    name: voiceNotes.title,
    exact: true,
  });
  await expect(source).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await source
    .getByRole('button', { name: voiceNotes.choose, exact: true })
    .click();
  await (await chooser).setFiles(pageComposerVoiceInput);
  await expect(source).toHaveCount(0);
  await expect(page.locator('.voice-player')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: storyProducts.heartMomentProduct.save,
      exact: true,
    }),
  ).toBeEnabled();
}

async function addPlanList(page: Page) {
  await tool(page, composer.list).click();
  const choice = page.getByRole('dialog', {
    name: m5s3.collection.choose,
    exact: true,
  });
  await choice
    .getByRole('checkbox', { name: new RegExp(content.listTitle) })
    .check();
  await choice
    .getByRole('button', { name: m5s3.collection.link, exact: true })
    .click();
  await expect(choice).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: content.listTitle, exact: true }),
  ).toBeVisible();
}

async function fullScreenRoundTrip(page: Page, info: TestInfo, name: string) {
  const carousel = page.locator('.media-gallery-carousel').first();
  await expect(carousel).toBeVisible();
  await expect(
    carousel.locator('.media-gallery-carousel-counter'),
  ).toContainText('1');
  await carousel
    .getByRole('button', { name: gallery.next, exact: true })
    .click();
  await expect(
    carousel.locator('.media-gallery-carousel-slide.is-active'),
  ).toHaveAttribute('data-carousel-index', '1');
  const activeSlide = carousel.locator(
    '.media-gallery-carousel-slide.is-active',
  );
  const reveal = carousel.getByRole('button', {
    name: sensitiveMedia.show,
    exact: true,
  });
  if (await reveal.count()) await reveal.last().click();
  const expand = carousel.getByRole('button', {
    name: photoReactions.fullscreen,
    exact: true,
  });
  await expand.click();
  const fullscreen = page.getByRole('dialog', {
    name: gallery.dialogAria,
    exact: true,
  });
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.locator('.media-lightbox-counter')).toContainText(
    '2',
  );
  await capture(page, info, `${name}-fullscreen`);
  await expect(
    fullscreen.getByRole('button', { name: gallery.zoomIn, exact: true }),
  ).toBeVisible();
  await fullscreen
    .getByRole('button', { name: gallery.zoomIn, exact: true })
    .click();
  await fullscreen
    .getByRole('button', { name: gallery.fit, exact: true })
    .click();
  await page.keyboard.press('Escape');
  await expect(fullscreen).toHaveCount(0);
  await expect(
    carousel.locator('.media-gallery-carousel-slide.is-active'),
  ).toHaveAttribute('data-carousel-index', '1');
  await expect(expand).toBeFocused();
  await activeSlide.click();
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen.locator('.media-lightbox-counter')).toContainText(
    '2',
  );
  await fullscreen
    .getByRole('button', { name: gallery.close, exact: true })
    .click();
  await expect(fullscreen).toHaveCount(0);
  await expect(activeSlide).toBeFocused();
}

test.use({ hasTouch: true, timezoneId: 'Europe/Berlin' });

for (const view of [
  { width: 360, theme: 'light', large: false, motion: 'no-preference' },
  { width: 360, theme: 'dark', large: false, motion: 'no-preference' },
  { width: 390, theme: 'light', large: false, motion: 'no-preference' },
  { width: 390, theme: 'dark', large: false, motion: 'no-preference' },
  { width: 430, theme: 'light', large: false, motion: 'no-preference' },
  { width: 430, theme: 'dark', large: false, motion: 'no-preference' },
  { width: 1280, theme: 'light', large: false, motion: 'no-preference' },
  { width: 1280, theme: 'dark', large: false, motion: 'no-preference' },
  { width: 320, theme: 'light', large: true, motion: 'reduce' },
  { width: 390, theme: 'dark', large: false, motion: 'reduce' },
] as const) {
  test(`page composer reference states at ${view.width} ${view.theme} ${view.large ? '200-percent' : view.motion}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: view.width, height: 844 });
    await page.emulateMedia({
      colorScheme: view.theme,
      reducedMotion: view.motion,
    });
    await page.clock.setFixedTime('2026-11-10T12:00:00Z');
    const state = await installPageComposerFixture(page);
    await signIn(page);
    page.on('dialog', (dialog) => dialog.accept());
    const suffix = `${view.width}-${view.theme}${view.large ? '-200-percent' : ''}${view.motion === 'reduce' ? '-reduced' : ''}`;
    for (const screen of [
      {
        name: 'diary-empty-frame-1',
        path: '/story/memories/new',
        tools: [composer.place, composer.tag],
      },
      {
        name: 'heart-empty-frame-5',
        path: '/story/heart-moments/new',
        tools: [composer.photo, composer.voice, composer.place, composer.tag],
      },
      {
        name: 'plan-empty-frame-9',
        path: '/plan/plans/new',
        tools: [composer.photo, composer.place, composer.list, composer.tag],
      },
      {
        name: 'diary-edit-frame-2',
        path: '/story/memories/mem-canal/edit',
        tools: [composer.place, composer.tag],
      },
      {
        name: 'heart-edit-frame-6',
        path: '/story/heart-moments/hm-love/edit',
        tools: [composer.photo, composer.voice, composer.place, composer.tag],
      },
      {
        name: 'plan-edit-frame-10',
        path: '/plan/plans/composer-plan',
        tools: [composer.photo, composer.place, composer.list, composer.tag],
        edit: true,
      },
    ]) {
      await page.goto(screen.path);
      if ('edit' in screen && screen.edit)
        await page
          .getByRole('button', { name: m5s3.common.edit, exact: true })
          .click();
      if (view.large)
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await expect(page.locator('.page-composer').last()).toBeVisible();
      await expectReadableComposerHeader(page);
      const row = page.locator('.composer-tool-row');
      await expect(row).toBeVisible();
      await expect(row).toBeInViewport();
      await expect(row.getByRole('button')).toHaveCount(screen.tools.length);
      for (const label of screen.tools) {
        const control = tool(page, label);
        await expect(control).toBeVisible();
        await expect(control).toBeInViewport();
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(48);
        expect(box?.height).toBeGreaterThanOrEqual(48);
      }
      if (!screen.path.includes('heart-moments'))
        await expect(page.locator('.composer-audience')).toHaveCount(0);
      else
        await expect(
          page.getByRole('radio', {
            name: storyProducts.heartEmotion.LOVED,
            exact: true,
          }),
        ).toBeVisible();
      await capture(page, info, `${screen.name}-${suffix}`);
      if (screen.path.endsWith('/new')) {
        if (screen.path.includes('heart-moments')) {
          await page
            .getByLabel(storyProducts.heartMomentProduct.textLabel, {
              exact: true,
            })
            .fill(content.heartText);
          await chooseFeeling(page, storyProducts.heartEmotion.GRATEFUL);
        } else if (screen.path.includes('/plans/')) {
          await page
            .getByLabel(m5s3.plan.intentionLabel, { exact: true })
            .fill(content.planTitle);
          await page
            .getByLabel(m5s3.common.description, { exact: true })
            .fill(content.planBody);
        } else {
          await page
            .getByLabel(de.memory.titleLabelOptional, { exact: true })
            .fill(content.memoryTitle);
          await page.locator('textarea[name="body"]').fill(content.memoryBody);
        }
        await addPhotos(page);
        await addPlaceAndTag(page);
        if (screen.path.includes('heart-moments')) await addVoice(page);
        if (screen.path.includes('/plans/')) await addPlanList(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        if (
          screen.path.includes('heart-moments') &&
          view.width === 390 &&
          !view.large
        ) {
          await waitForSettledMotion(page);
          const geometry = await page.evaluate(() => ({
            voiceBottom: document
              .querySelector('.voice-player')
              ?.getBoundingClientRect().bottom,
            toolsTop: document
              .querySelector('.composer-tool-row')
              ?.getBoundingClientRect().top,
          }));
          expect(geometry.voiceBottom).toBeDefined();
          expect(geometry.toolsTop).toBeDefined();
          expect(
            geometry.voiceBottom,
            JSON.stringify(geometry),
          ).toBeLessThanOrEqual(geometry.toolsTop ?? 0);
        }
        await capture(
          page,
          info,
          `${screen.name.replace('empty', 'populated-create')}-${suffix}`,
        );
      }
    }
    for (const screen of [
      {
        name: 'diary-detail-frame-13',
        path: '/story/memories/mem-canal',
        title: content.memoryTitle,
      },
      {
        name: 'heart-detail-frame-15',
        path: '/story/heart-moments/hm-love',
        title: content.heartText,
      },
      {
        name: 'plan-detail-frame-16',
        path: '/plan/plans/composer-plan',
        title: content.planTitle,
      },
    ]) {
      await page.goto(screen.path);
      if (view.large)
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      if (screen.path.includes('heart-moments'))
        await expect(
          page.getByText(screen.title, { exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole('heading', { name: screen.title, exact: true }),
        ).toBeVisible();
      await expect(page.locator('.media-gallery-carousel')).toBeVisible();
      await expect(
        page
          .getByRole('link', { name: taskBoundary.back, exact: true })
          .or(
            page.getByRole('button', { name: taskBoundary.back, exact: true }),
          ),
      ).toBeVisible();
      await capture(page, info, `${screen.name}-${suffix}`);
      if (screen.name === 'diary-detail-frame-13') {
        await page
          .getByRole('heading', {
            name: storyProducts.comments.heading,
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        await capture(page, info, `diary-comments-frame-14-${suffix}`);
      }
    }
    expect(state.unexpected).toEqual([]);
  });
}

test('Diary tools preserve photos, cover, sensitivity, place and tag through save, detail and return', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  await page.goto('/story/memories/new');
  await page
    .getByLabel(de.memory.titleLabelOptional, { exact: true })
    .fill(content.memoryTitle);
  await page.locator('textarea[name="body"]').fill(content.memoryBody);
  await addPhotos(page);
  const sources = await openComposerMediaSources(page);
  await capture(page, info, 'diary-photo-source-sheet');
  await page.keyboard.press('Escape');
  await expect(sources).toHaveCount(0);
  const second = page.locator('.photo-draft-item').nth(1);
  await second.locator('.photo-draft-tile').click();
  await second
    .getByRole('button', { name: experiences.chooseCover, exact: true })
    .click();
  await second.locator('.photo-draft-tile').click();
  await second
    .getByRole('checkbox', { name: sensitiveMedia.mark, exact: true })
    .click();
  await page
    .locator('.photo-draft-gallery')
    .getByRole('button', {
      name: experiences.finish,
      exact: true,
    })
    .click();
  await tool(page, composer.place).click();
  const places = page.getByRole('dialog').last();
  await places
    .getByLabel(photoPlaces.savedSearch, { exact: true })
    .fill(content.placeName);
  await places
    .getByRole('button', { name: new RegExp(content.placeName) })
    .click();
  if (await places.isVisible()) await closeChoice(page);
  await expect(places).toHaveCount(0);
  await showContextTags(page);
  await capture(page, info, 'diary-tag-sheet-frame-4');
  await page
    .getByLabel(contextTags.newLabel, { exact: true })
    .fill(content.tag);
  await page.keyboard.press('Enter');
  await closeChoice(page);
  await expect(tool(page, composer.tag)).toBeFocused();
  await setComposerDate(page, '2026-11-10');
  await capture(page, info, 'diary-populated-frame-2');
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(/\/story\/memories\/composer-created-memories$/);
  const saved = state.resources.get('memories/composer-created-memories');
  if (!saved) throw new Error('The confirmed Memory must be readable.');
  expect(saved.tags).toEqual([content.tag]);
  expect(saved.placeIds).toEqual(['composer-place']);
  expect(saved.selectedCoverAttachmentId).toBe('composer-upload-2');
  expect(
    (saved.attachments as Array<{ isSensitive: boolean }>)[1].isSensitive,
  ).toBe(true);
  await expect(page.locator('.drop-cap-letter')).toHaveText(
    content.memoryBody[0].toUpperCase(),
  );
  await capture(page, info, 'diary-saved-detail-frame-13');
  await page
    .getByRole('button', { name: taskBoundary.back, exact: true })
    .or(page.getByRole('link', { name: taskBoundary.back, exact: true }))
    .click();
  await expect(page).toHaveURL(/\/story(?:\?|$)/);
  expect(
    state.calls.filter(
      (call) => call.method === 'POST' && call.path.endsWith('/memories'),
    ),
  ).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});

test('saved galleries retain sensitive reveal, swipe, fullscreen zoom and the same slide on return', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  for (const [name, path] of [
    ['diary', '/story/memories/mem-canal'],
    ['heart', '/story/heart-moments/hm-love'],
    ['plan', '/plan/plans/composer-plan'],
  ]) {
    await page.goto(path);
    await fullScreenRoundTrip(page, info, name);
    if (name === 'diary') {
      await page
        .getByRole('button', { name: photoReactions.open, exact: true })
        .click();
      const choices = page.getByRole('group', {
        name: photoReactions.choose,
        exact: true,
      });
      await expect(choices.getByRole('button')).toHaveCount(6);
      await choices
        .getByRole('button', { name: photoReactions.names.LOVE, exact: true })
        .click();
      await expect(page.locator('.memory-photo-reactions')).toContainText('1');
    }
    await capture(page, info, `${name}-gallery-return`);
    await swipeCarousel(page, 'previous');
    await nextFrame(page);
    await expect(
      page.locator('.media-gallery-carousel-slide.is-active'),
    ).toHaveAttribute('data-carousel-index', '0');
  }
  expect(state.unexpected).toEqual([]);
});

test('Diary reload restores authored words, selected media and draft context before one deliberate save', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  await page.goto('/story/memories/new');
  await page
    .getByLabel(de.memory.titleLabelOptional, { exact: true })
    .fill(content.memoryTitle);
  await page.locator('textarea[name="body"]').fill(content.memoryBody);
  await addPhotos(page);
  await expect(
    page.getByText(de.memory.diary.draft.saved, { exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole('button', { name: de.memory.diary.resume, exact: true })
    .click();
  await expect(
    page.getByLabel(de.memory.titleLabelOptional, { exact: true }),
  ).toHaveValue(content.memoryTitle);
  await expect(page.locator('textarea[name="body"]')).toHaveValue(
    content.memoryBody,
  );
  await expect(page.locator('.photo-draft-tile')).toHaveCount(2);
  await capture(page, info, 'diary-restored-draft');
  await page.getByRole('button', { name: de.memory.save, exact: true }).click();
  await expect(page).toHaveURL(/\/story\/memories\/composer-created-memories$/);
  expect(
    state.calls.filter(
      (call) => call.method === 'POST' && call.path.endsWith('/memories'),
    ),
  ).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});

test('the Place task creates a named shared Place and selects it without saving the parent', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  await page.goto('/story/memories/new');
  await tool(page, composer.place).click();
  const choices = page.getByRole('dialog').last();
  await choices
    .getByLabel(photoPlaces.savedSearch, { exact: true })
    .fill(content.newPlace);
  await choices
    .getByRole('button', {
      name: composer.createNamedPlace.replace('{{name}}', content.newPlace),
      exact: true,
    })
    .click();
  const create = page.getByRole('dialog', {
    name: composer.newPlace,
    exact: true,
  });
  await expect(create.getByLabel(m5s3.place.name, { exact: true })).toHaveValue(
    content.newPlace,
  );
  await capture(page, info, 'new-place-sheet-frame-12');
  await create
    .getByRole('button', { name: photoPlaces.saveSharedPlace, exact: true })
    .click();
  await expect(create).toHaveCount(0);
  if (await choices.isVisible()) await closeChoice(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.composer-context')).toContainText(
    content.newPlace,
  );
  expect(state.places).toHaveLength(2);
  expect(
    state.calls.filter(
      (call) => call.method === 'POST' && call.path.endsWith('/memories'),
    ),
  ).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

for (const [name, path] of [
  ['Diary', '/story/memories/new'],
  ['HeartMoment', '/story/heart-moments/new'],
  ['Plan', '/plan/plans/new'],
]) {
  test(`${name} accepts photo drops on the writing area and rejects unsupported files without losing words`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await installPageComposerFixture(page);
    await signIn(page);
    await page.goto(path);
    const transfer = await page.evaluateHandle(
      (bytes) => {
        const data = new DataTransfer();
        data.items.add(
          new File([Uint8Array.from(bytes)], 'dropped-lake.jpg', {
            type: 'image/jpeg',
          }),
        );
        return data;
      },
      [...photo],
    );
    const words = page.locator('.page-composer textarea').first();
    const writing = words;
    await words.fill('Words retained while adding photographs.');
    await writing.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(page.locator('.media-drop-zone.is-dragging')).toBeVisible();
    await writing.dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.locator('.photo-draft-tile')).toHaveCount(1);
    await expect(words).toHaveValue('Words retained while adding photographs.');
    await expect(page.locator('.media-drop-zone.is-dragging')).toHaveCount(0);
    const invalid = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File(['unsupported'], 'notes.txt', { type: 'text/plain' }),
      );
      return data;
    });
    await writing.dispatchEvent('drop', { dataTransfer: invalid });
    await expect(page.getByRole('alert')).toContainText(
      mediaDrop.supportedPhotos,
    );
    await expect(page.locator('.photo-draft-tile')).toHaveCount(1);
    expect(state.unexpected).toEqual([]);
  });
}

test('HeartMoment keeps every feeling visible, tints page and system bar, and restores visibility after choice', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  const initialBar = await page
    .locator('meta[name="theme-color"]')
    .getAttribute('content');
  await page.goto('/story/heart-moments/new');
  await page
    .getByLabel(storyProducts.heartMomentProduct.textLabel, { exact: true })
    .fill(content.heartText);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const colors = new Set<string>();
    for (const feeling of Object.values(storyProducts.heartEmotion)) {
      await chooseFeeling(page, feeling);
      for (const label of Object.values(storyProducts.heartEmotion))
        await expect(
          page.getByRole('radio', { name: label, exact: true }),
        ).toBeVisible();
      colors.add(
        (await page
          .locator('meta[name="theme-color"]')
          .getAttribute('content')) ?? '',
      );
      expect(
        (await new AxeBuilder({ page }).include('.page-composer').analyze())
          .violations,
      ).toEqual([]);
    }
    expect(colors.size).toBe(6);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await chooseFeeling(page, storyProducts.heartEmotion.GRATEFUL);
  await capture(page, info, 'heart-feeling-frame-5');
  const audience = await showHeartAudience(page);
  await audience
    .getByRole('radio', {
      name: storyProducts.heartMomentProduct.visibilityPrivate,
      exact: true,
    })
    .click();
  await expect(audience).toHaveCount(0);
  await showHeartAudience(page);
  await audience
    .getByRole('radio', {
      name: storyProducts.heartMomentProduct.visibilityShared,
      exact: true,
    })
    .click();
  await expect(audience).toHaveCount(0);
  await expect(page.locator('.composer-audience > button')).toBeFocused();
  const sources = await openComposerMediaSources(page);
  await expect(
    sources.getByRole('button', { name: photoSources.device, exact: true }),
  ).toBeVisible();
  await capture(page, info, 'photo-source-sheet-frame-8');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', {
      name: storyProducts.heartMomentProduct.save,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(
    /\/story\/heart-moments\/composer-created-heart-moments$/,
  );
  expect(
    state.resources.get('heart-moments/composer-created-heart-moments')
      ?.visibility,
  ).toBe('SHARED');
  await page.goto('/story?tab=timeline');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    initialBar ?? '',
  );
  expect(state.unexpected).toEqual([]);
});

test('Plan schedule and linked checklist remain bounded tasks with updated progress', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  await page.goto('/plan/plans/composer-plan');
  await page
    .getByRole('button', { name: m5s3.common.edit, exact: true })
    .click();
  const sources = await openComposerMediaSources(page);
  await capture(page, info, 'plan-photo-source-sheet');
  await page.keyboard.press('Escape');
  await expect(sources).toHaveCount(0);
  const schedule = await showPlanSchedule(page);
  await capture(page, info, 'plan-schedule-sheet-frame-11');
  await expect(schedule.locator('input[type="date"]').first()).toHaveValue(
    '2026-11-21',
  );
  await closePlanSchedule(page);
  await tool(page, composer.list).click();
  await capture(page, info, 'plan-list-choice');
  await closeChoice(page);
  await page
    .getByRole('button', { name: m5s3.common.saveChanges, exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/plans\/composer-plan$/);
  const list = page
    .locator('.plan-collection-row')
    .filter({ hasText: content.listTitle });
  await list.getByRole('button').or(list.getByRole('link')).first().click();
  const sheet = page.getByRole('dialog', {
    name: content.listTitle,
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await capture(page, info, 'plan-list-composer-frame-17');
  await sheet
    .getByRole('button', {
      name: m5s3.collection.markDone.replace('{{title}}', content.listItems[2]),
      exact: true,
    })
    .click();
  await expect
    .poll(() => state.list.items.filter((item) => item.completed).length)
    .toBe(3);
  await sheet
    .getByLabel(m5s3.collection.newItem, { exact: true })
    .fill(content.addedListItem);
  await sheet
    .getByRole('button', { name: m5s3.collection.addItem, exact: true })
    .click();
  await expect.poll(() => state.list.items.length).toBe(5);
  await closeChoice(page);
  expect(state.list.items.filter((item) => item.completed)).toHaveLength(3);
  await expect(list).toContainText('3');
  await expect(page.locator('.drop-cap-letter')).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: storyProducts.descriptionDisclosure.more,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: storyProducts.descriptionDisclosure.more,
      exact: true,
    })
    .click();
  const less = page.getByRole('button', {
    name: storyProducts.descriptionDisclosure.less,
    exact: true,
  });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.expandable-description')).toContainText(
    content.planBody.split('\n\n').at(-1) ?? '',
  );
  await less.click();
  await expect(
    page.getByRole('button', {
      name: storyProducts.descriptionDisclosure.more,
      exact: true,
    }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(state.unexpected).toEqual([]);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('detail Places open the existing in-app map and Back restores the same reading position', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  for (const path of [
    '/story/memories/mem-canal',
    '/story/heart-moments/hm-love',
    '/plan/plans/composer-plan',
  ]) {
    await page.goto(path);
    const place = page.getByRole('link', {
      name: content.placeName,
      exact: true,
    });
    await expect(place).toHaveAttribute(
      'href',
      '/story/map?place=49.56%3A7.07',
    );
    await page.evaluate(() => window.scrollTo(0, 60));
    const before = await page.evaluate(() => window.scrollY);
    await place.click();
    await expect(page).toHaveURL(/\/story\/map\?place=49.56%3A7.07$/);
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .or(page.getByRole('link', { name: taskBoundary.back, exact: true }))
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(before, 0);
  }
  expect(state.unexpected).toEqual([]);
});
