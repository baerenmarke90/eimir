import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import composer from '../../src/i18n/locales/composer';
import planFiles from '../../src/i18n/locales/planFiles';
import contextTags from '../../src/i18n/locales/contextTags';
import de from '../../src/i18n/locales/de';
import experiences from '../../src/i18n/locales/experiences';
import m5s3 from '../../src/i18n/locales/m5s3';
import mediaDrop from '../../src/i18n/locales/mediaDrop';
import memoryProduct from '../../src/i18n/locales/memoryProduct';
import photoPlaces from '../../src/i18n/locales/photoPlaces';
import photoReactions from '../../src/i18n/locales/photoReactions';
import photoSources from '../../src/i18n/locales/photoSources';
import sensitiveMedia from '../../src/i18n/locales/sensitiveMedia';
import storyProducts from '../../src/i18n/locales/storyProducts';
import taskBoundary from '../../src/i18n/locales/taskBoundary';
import voiceNotes from '../../src/i18n/locales/voiceNotes';
import { nextFrame, swipeCarousel } from '../support/mediaCarouselGesture';
import { expectQuietComposerMedia } from '../support/mediaDraft';
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
import {
  captureScreenshot,
  DETAIL_COMMENTS,
  signIn,
} from '../support/storyTimelineFixture';

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

async function expectMediaBeforeWriting(
  lead: Locator,
  { composer: editing, heart }: { composer: boolean; heart: boolean },
) {
  const layout = await lead.evaluate(
    (element, options) => {
      const media = document.querySelector(
        options.editing ? '.photo-draft-gallery' : '.media-gallery-carousel',
      );
      const voice = options.heart
        ? document.querySelector('.voice-player')
        : null;
      const feeling = options.heart
        ? document.querySelector(
            options.editing
              ? '.heart-emotion-picker'
              : '.heart-moment-detail-emotion',
          )
        : null;
      const rect = (node: Element | null) =>
        node?.getBoundingClientRect().toJSON();
      return {
        media: rect(media),
        voice: rect(voice),
        lead: rect(element),
        feeling: rect(feeling),
      };
    },
    { editing, heart },
  );
  const diagnostic = JSON.stringify(layout);
  expect(layout.media, diagnostic).toBeDefined();
  expect(layout.media?.bottom, diagnostic).toBeLessThanOrEqual(
    (layout.voice?.top ?? layout.lead?.top ?? 0) + 1,
  );
  if (layout.voice)
    expect(layout.voice.bottom, diagnostic).toBeLessThanOrEqual(
      (layout.lead?.top ?? 0) + 1,
    );
  if (heart) {
    expect(layout.feeling, diagnostic).toBeDefined();
    expect(layout.lead?.bottom, diagnostic).toBeLessThanOrEqual(
      (layout.feeling?.top ?? 0) + 1,
    );
  }
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
  if (await page.locator('.composer-photo-draft').count())
    await expectQuietComposerMedia(page);
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
  if (info.title.includes('200-percent')) {
    const selectedFeelings = await page
      .locator('.heart-emotion-choice:has(input:checked)')
      .evaluateAll((choices) =>
        choices.map((choice) => {
          const visual = choice
            .querySelector('.heart-emotion-choice-visual')
            ?.getBoundingClientRect();
          const check = choice
            .querySelector('.heart-emotion-choice-check')
            ?.getBoundingClientRect();
          return {
            emotion: choice.getAttribute('data-emotion'),
            visual: visual?.toJSON(),
            check: check?.toJSON(),
          };
        }),
      );
    for (const feeling of selectedFeelings) {
      const diagnostic = JSON.stringify(feeling);
      expect(feeling.visual, diagnostic).toBeDefined();
      expect(feeling.check, diagnostic).toBeDefined();
      expect(feeling.check?.left, diagnostic).toBeGreaterThanOrEqual(
        (feeling.visual?.left ?? 0) - 1,
      );
      expect(feeling.check?.right, diagnostic).toBeLessThanOrEqual(
        (feeling.visual?.right ?? 0) + 1,
      );
      expect(feeling.check?.top, diagnostic).toBeGreaterThanOrEqual(
        (feeling.visual?.top ?? 0) - 1,
      );
      expect(feeling.check?.bottom, diagnostic).toBeLessThanOrEqual(
        (feeling.visual?.bottom ?? 0) + 1,
      );
    }
    const stages = await page
      .locator('.photo-draft-stage .media-gallery-carousel-viewport')
      .evaluateAll((viewports) =>
        viewports.map((viewport) => {
          const slide = viewport.querySelector(
            '.media-gallery-carousel-slide.is-active',
          );
          const image = slide?.querySelector('img.media-gallery-thumb-content');
          const slideStyle = slide ? getComputedStyle(slide) : null;
          return {
            frame: viewport.getBoundingClientRect().toJSON(),
            slide:
              slide && slideStyle
                ? {
                    rect: slide.getBoundingClientRect().toJSON(),
                    padding: [
                      slideStyle.paddingTop,
                      slideStyle.paddingRight,
                      slideStyle.paddingBottom,
                      slideStyle.paddingLeft,
                    ],
                  }
                : null,
            image: image
              ? {
                  rect: image.getBoundingClientRect().toJSON(),
                  fit: getComputedStyle(image).objectFit,
                }
              : null,
            controls: [
              ...viewport.querySelectorAll(
                '.photo-draft-stage-cover, .photo-draft-stage-remove, .photo-draft-stage-sensitive, .media-gallery-carousel-counter',
              ),
            ].map((element) => ({
              name: element.getAttribute('aria-label') ?? element.textContent,
              rect: element.getBoundingClientRect().toJSON(),
            })),
          };
        }),
      );
    for (const stage of stages) {
      const diagnostic = JSON.stringify(stage);
      expect(stage.slide?.padding, diagnostic).toEqual([
        '0px',
        '0px',
        '0px',
        '0px',
      ]);
      expect(stage.image?.fit, diagnostic).toBe('cover');
      for (const bounds of [stage.slide?.rect, stage.image?.rect]) {
        for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
          expect(
            Math.abs((bounds?.[edge] ?? Number.NaN) - stage.frame[edge]),
            diagnostic,
          ).toBeLessThanOrEqual(1);
        }
      }
      expect(stage.controls, diagnostic).toHaveLength(4);
      for (const [index, control] of stage.controls.entries()) {
        expect(control.rect.left, diagnostic).toBeGreaterThanOrEqual(
          stage.frame.left - 1,
        );
        expect(control.rect.right, diagnostic).toBeLessThanOrEqual(
          stage.frame.right + 1,
        );
        expect(control.rect.top, diagnostic).toBeGreaterThanOrEqual(
          stage.frame.top - 1,
        );
        expect(control.rect.bottom, diagnostic).toBeLessThanOrEqual(
          stage.frame.bottom + 1,
        );
        for (const other of stage.controls.slice(index + 1)) {
          const overlaps =
            Math.min(control.rect.right, other.rect.right) -
              Math.max(control.rect.left, other.rect.left) >
              1 &&
            Math.min(control.rect.bottom, other.rect.bottom) -
              Math.max(control.rect.top, other.rect.top) >
              1;
          expect(overlaps, diagnostic).toBe(false);
        }
      }
    }
    if (stages.length)
      expect(
        (await new AxeBuilder({ page }).include('.photo-draft-stage').analyze())
          .violations,
      ).toEqual([]);
  }
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
  if (
    /^(diary-edit-frame-2|heart-edit-frame-6|plan-edit-frame-10)-320-light-200-percent-reduced$/.test(
      name,
    )
  ) {
    const scrollY = await page.evaluate(() => window.scrollY);
    try {
      await nextFrame(page);
      await waitForSettledMotion(page);
      const stage = page.locator(
        '.photo-draft-stage .media-gallery-carousel-viewport',
      );
      await stage.evaluate((element) =>
        element.scrollIntoView({ block: 'center', behavior: 'instant' }),
      );
      await nextFrame(page);
      await waitForSettledMotion(page);
      await expect(stage).toBeInViewport({ ratio: 1 });
      const corners = stage.locator(
        '.photo-draft-stage-cover, .photo-draft-stage-remove, .photo-draft-stage-sensitive, .media-gallery-carousel-counter',
      );
      await expect(corners).toHaveCount(4);
      for (const corner of await corners.all()) {
        await expect(corner).toBeVisible();
        await expect(corner).toBeInViewport({ ratio: 1 });
      }
      const geometry = await stage.evaluate((element) => {
        const slide = element.querySelector(
          '.media-gallery-carousel-slide.is-active',
        );
        const image = slide?.querySelector('img.media-gallery-thumb-content');
        return {
          frame: element.getBoundingClientRect().toJSON(),
          bounds: [slide, image].map((node) =>
            node?.getBoundingClientRect().toJSON(),
          ),
          fit: image ? getComputedStyle(image).objectFit : null,
        };
      });
      const diagnostic = JSON.stringify(geometry);
      expect(geometry.fit, diagnostic).toBe('cover');
      for (const bounds of geometry.bounds)
        for (const edge of ['left', 'right', 'top', 'bottom'] as const)
          expect(
            Math.abs((bounds?.[edge] ?? Number.NaN) - geometry.frame[edge]),
            diagnostic,
          ).toBeLessThanOrEqual(1);
      const visibleCorners = await corners.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return Boolean(
            hit &&
              (element.matches('.media-gallery-carousel-counter')
                ? element
                    .closest('.media-gallery-carousel-viewport')
                    ?.contains(hit)
                : element.contains(hit)),
          );
        }),
      );
      expect(visibleCorners).toEqual([true, true, true, true]);
      await captureScreenshot(page, info, `1730-${name}-stage.png`, {
        animations: 'disabled',
      });
    } finally {
      await page.evaluate(
        (top) => window.scrollTo({ top, behavior: 'instant' }),
        scrollY,
      );
      await nextFrame(page);
    }
  }
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

async function settleDraftPhotos(page: Page) {
  for (const tile of await page.locator('.photo-draft-tile').all()) {
    await tile.scrollIntoViewIfNeeded();
    const image = tile.locator('img').last();
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function addPlaceAndTag(page: Page) {
  await tool(page, composer.place).click();
  const places = page.getByRole('dialog').last();
  await places
    .getByLabel(photoPlaces.savedSearch, { exact: true })
    .fill(content.placeName);
  await places
    .locator('.moment-place-choices')
    .getByRole('button', { name: new RegExp(`^${content.placeName}`) })
    .click();
  if (await places.isVisible()) await closeChoice(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page
      .locator('.composer-place-context')
      .filter({ hasText: content.placeName }),
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
  await expect(
    activeSlide.locator('.media-gallery-carousel-content'),
  ).toHaveCSS('object-fit', 'contain');
  expect(
    (await carousel.locator('.media-gallery-carousel-viewport').boundingBox())
      ?.height,
  ).toBeGreaterThan(300);
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
    const state = await installPageComposerFixture(page, {
      sensitivePhotos: false,
      linkedWish: true,
    });
    await signIn(page);
    page.on('dialog', (dialog) => dialog.accept());
    const suffix = `${view.width}-${view.theme}${view.large ? '-200-percent' : ''}${view.motion === 'reduce' ? '-reduced' : ''}`;
    for (const screen of [
      {
        name: 'diary-empty-frame-1',
        path: '/story/memories/new',
        // #1790 D1: the diary keeps one on-page photo entry, no photo tool.
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
        tools: [
          composer.photo,
          planFiles.add,
          composer.place,
          composer.list,
          composer.tag,
        ],
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
        tools: [
          composer.photo,
          planFiles.add,
          composer.place,
          composer.list,
          composer.tag,
        ],
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
      if (!screen.path.endsWith('/new')) {
        await settleDraftPhotos(page);
        await expectMediaBeforeWriting(
          page
            .locator('input[name="title"], textarea#heart-moment-text')
            .first(),
          { composer: true, heart: screen.path.includes('heart-moments') },
        );
      }
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
        await settleDraftPhotos(page);
        await expectMediaBeforeWriting(
          page
            .locator('input[name="title"], textarea#heart-moment-text')
            .first(),
          { composer: true, heart: screen.path.includes('heart-moments') },
        );
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
          .getByRole('link', { name: content.placeName, exact: true })
          .first(),
      ).toHaveAttribute('href', /\/story\/map\?place=/);
      if (screen.path.startsWith('/plan/'))
        await expect(
          page
            .getByRole('link', { name: content.placeName, exact: true })
            .first(),
        ).toHaveCSS('text-decoration-line', 'underline');
      const hero = page.locator(
        '.media-gallery-carousel-slide.is-active img.media-gallery-thumb-content',
      );
      await expect(hero).toBeVisible();
      await expect
        .poll(() =>
          hero.evaluate((element: HTMLImageElement) => element.naturalWidth),
        )
        .toBeGreaterThan(0);
      await expectMediaBeforeWriting(
        screen.path.includes('heart-moments')
          ? page.locator('.heart-moment-detail-text')
          : page.getByRole('heading', { name: screen.title, exact: true }),
        { composer: false, heart: screen.path.includes('heart-moments') },
      );
      await expect(
        page
          .getByRole('link', { name: taskBoundary.back, exact: true })
          .or(
            page.getByRole('button', { name: taskBoundary.back, exact: true }),
          ),
      ).toBeVisible();
      if (view.width === 390 && view.motion === 'no-preference')
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
      await capture(page, info, `${screen.name}-${suffix}`);
      if (screen.name === 'diary-detail-frame-13') {
        await expect(
          page
            .locator('.memory-planning-links')
            .getByRole('link', { name: new RegExp(content.wishTitle) }),
        ).toHaveAttribute('href', '/plan/wishes/composer-wish');
        const comments = page.locator('.comments-panel');
        await expect(comments).toContainText(DETAIL_COMMENTS[0].body);
        await expect(comments.locator('textarea')).toBeVisible();
        await comments.evaluate((panel) =>
          panel.scrollIntoView({ block: 'center', behavior: 'instant' }),
        );
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
  const stage = page.locator('.photo-draft-stage');
  await stage
    .getByRole('button', { name: experiences.chooseCover, exact: true })
    .click();
  await stage
    .getByRole('checkbox', { name: new RegExp(`^${sensitiveMedia.mark}:`) })
    .click();
  await expect(page.locator('.photo-draft-gallery.is-managing')).toHaveCount(0);
  await tool(page, composer.place).click();
  const places = page.getByRole('dialog').last();
  await places
    .getByLabel(photoPlaces.savedSearch, { exact: true })
    .fill(content.placeName);
  await places
    .locator('.moment-place-choices')
    .getByRole('button', { name: new RegExp(`^${content.placeName}`) })
    .click();
  if (await places.isVisible()) await closeChoice(page);
  await expect(places).toHaveCount(0);
  await expect(
    page
      .locator('.composer-place-context')
      .filter({ hasText: content.placeName }),
  ).toBeVisible();
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

for (const theme of ['light', 'dark'] as const) {
  for (const kind of ['diary', 'heart', 'plan'] as const) {
    test(`PO media controls stay on the cover through failed-upload retry and save: ${kind} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const state = await installPageComposerFixture(page, {
        sensitivePhotos: false,
      });
      await signIn(page);
      const route =
        kind === 'diary'
          ? '/story/memories/new'
          : kind === 'heart'
            ? '/story/heart-moments/new'
            : '/plan/plans/new';
      await page.goto(route);
      if (kind === 'diary') {
        await page
          .getByLabel(de.memory.titleLabelOptional, { exact: true })
          .fill(content.memoryTitle);
        await page.locator('textarea[name="body"]').fill(content.memoryBody);
      } else if (kind === 'heart') {
        await page.locator('#heart-moment-text').fill(content.heartText);
      } else {
        await page
          .getByLabel(m5s3.plan.intentionLabel, { exact: true })
          .fill(content.planTitle);
        await page
          .getByLabel(m5s3.common.description, { exact: true })
          .fill(content.planBody);
      }
      await addPhotos(page);
      await settleDraftPhotos(page);
      const draft = page.locator('.photo-draft-gallery');
      const stage = draft.locator('.photo-draft-stage');
      const tiles = draft.locator('.photo-draft-grid .photo-draft-tile');
      const sensitivity = stage.getByRole('checkbox', {
        name: new RegExp(`^${sensitiveMedia.mark}:`),
      });
      const assertStrip = async (count: number) => {
        await expect(stage).toHaveRole('group');
        await expect(stage).toHaveAccessibleName(de.memory.photoSelected);
        await expect(draft).not.toHaveClass(/is-managing/);
        await expect(tiles).toHaveCount(count);
        await expect(
          draft.locator('.photo-draft-grid :is(input, .photo-draft-action)'),
        ).toHaveCount(0);
        await expect(
          draft.getByRole('button', { name: experiences.finish, exact: true }),
        ).toHaveCount(0);
        const geometry = await tiles.evaluateAll((buttons) =>
          buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return { width: rect.width, height: rect.height, y: rect.y };
          }),
        );
        for (const item of geometry) {
          expect(item.width).toBeGreaterThanOrEqual(55);
          expect(item.width).toBeLessThanOrEqual(57);
          expect(item.height).toBeGreaterThanOrEqual(55);
          expect(item.height).toBeLessThanOrEqual(57);
          expect(Math.abs(item.y - geometry[0].y)).toBeLessThan(1);
        }
        for (const action of [
          stage.locator('.photo-draft-stage-remove'),
          stage.locator('.photo-draft-stage-sensitive'),
        ]) {
          await expect(action).toBeVisible();
          const rect = await action.boundingBox();
          expect(rect?.width).toBeGreaterThanOrEqual(44);
          expect(rect?.height).toBeGreaterThanOrEqual(44);
        }
        await expectQuietComposerMedia(page);
        await noOverflow(page);
      };
      await assertStrip(2);
      await expect(
        stage.locator(
          '.media-gallery-carousel-slide.is-active img.media-gallery-thumb-content',
        ),
      ).toHaveCSS('object-fit', 'cover');
      await capture(page, info, `po-${kind}-media-several-390-${theme}`);
      expect(
        (
          await new AxeBuilder({ page })
            .include('.photo-draft-gallery')
            .analyze()
        ).violations,
      ).toEqual([]);
      await tiles.nth(1).click();
      await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await assertStrip(2);
      await stage
        .getByRole('button', { name: experiences.chooseCover, exact: true })
        .click();
      await expect(stage.locator('.photo-draft-stage-cover')).toContainText(
        experiences.cover,
      );
      await sensitivity.check();
      await expect(sensitivity).toBeChecked();
      await expect(
        stage.locator('.sensitive-media-cover').first(),
      ).toBeVisible();
      const protectedPreview = tiles.nth(1).locator('.sensitive-media-blurred');
      await expect(protectedPreview).toBeVisible();
      await expect
        .poll(() =>
          protectedPreview
            .locator('img')
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      const treatment = await protectedPreview.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const tileElement = element.closest('.photo-draft-tile');
        if (!tileElement)
          throw new Error('The protected thumbnail needs its clipping owner.');
        const tile = tileElement.getBoundingClientRect();
        const cover = element.closest('.sensitive-media-cover');
        if (!cover) throw new Error('The protected image needs its cover.');
        const mask = cover.getBoundingClientRect();
        return {
          image: element.querySelector('img')?.currentSrc,
          filter: style.filter,
          clippedByCover: getComputedStyle(cover).overflow,
          maskInsideTile:
            mask.left >= tile.left - 1 &&
            mask.right <= tile.right + 1 &&
            mask.top >= tile.top - 1 &&
            mask.bottom <= tile.bottom + 1,
          coversMask: Boolean(
            rect.left <= mask.left &&
              rect.right >= mask.right &&
              rect.top <= mask.top &&
              rect.bottom >= mask.bottom,
          ),
        };
      });
      expect(treatment.image).toMatch(/^blob:/);
      expect(treatment.filter).toContain('blur(');
      expect(treatment.clippedByCover).toBe('hidden');
      expect(treatment.maskInsideTile).toBe(true);
      expect(treatment.coversMask).toBe(true);
      await expect(protectedPreview.getByRole('img')).toHaveCount(0);
      await assertStrip(2);
      await capture(page, info, `po-${kind}-media-sensitive-390-${theme}`);
      // The latest PO correction removes the inline reveal row; the existing
      // image activation still opens concealed fullscreen with its privacy controls.
      await stage.locator('.media-gallery-carousel-slide.is-active').click();
      const fullscreen = page.getByRole('dialog', {
        name: gallery.dialogAria,
        exact: true,
      });
      await expect(fullscreen).toBeVisible();
      const revealedPhoto = fullscreen.getByRole('img', {
        name: gallery.imageAlt,
        exact: true,
      });
      await expect(revealedPhoto).toHaveCount(0);
      const reveal = fullscreen.getByRole('button', {
        name: sensitiveMedia.show,
        exact: true,
      });
      await expect(reveal).toHaveAttribute('aria-pressed', 'false');
      await reveal.click();
      await expect(revealedPhoto).toBeVisible();
      await expect
        .poll(() =>
          revealedPhoto.evaluate(
            (image: HTMLImageElement) => image.naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      const hide = fullscreen.getByRole('button', {
        name: sensitiveMedia.hide,
        exact: true,
      });
      await expect(hide).toHaveAttribute('aria-pressed', 'true');
      await hide.click();
      await expect(revealedPhoto).toHaveCount(0);
      await expect(reveal).toHaveAttribute('aria-pressed', 'false');
      await fullscreen
        .getByRole('button', { name: gallery.close, exact: true })
        .click();
      await expect(fullscreen).toHaveCount(0);
      await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expectQuietComposerMedia(page);
      state.uploads.failuresRemaining = 1;
      await page
        .locator('input[type="file"][accept*="image/jpeg"]')
        .first()
        .setInputFiles({
          name: 'retry-photo.jpg',
          mimeType: 'image/jpeg',
          buffer: photo,
        });
      await expect(tiles).toHaveCount(3);
      await expect(tiles.nth(2)).toHaveAccessibleName(
        new RegExp(de.memory.photoFailed),
      );
      expect(state.uploads.failedRequests).toBe(1);
      await tiles.nth(2).click();
      const retry = stage
        .getByRole('button', { name: de.common.retry, exact: true })
        .and(stage.locator('.photo-draft-stage-retry'));
      await expect(retry).toBeVisible();
      await assertStrip(3);
      await capture(page, info, `po-${kind}-media-failed-390-${theme}`);
      expect(
        (
          await new AxeBuilder({ page })
            .include('.photo-draft-gallery')
            .analyze()
        ).violations,
      ).toEqual([]);
      await retry.click();
      await expect(tiles.nth(2)).toHaveAccessibleName(
        new RegExp(de.memory.photoReady),
      );
      expect(state.uploads.requests).toBe(4);
      await expect(retry).toHaveCount(0);
      await stage.locator('.photo-draft-stage-remove').click();
      await expect(tiles).toHaveCount(2);
      await tiles.nth(1).click();
      await expect(sensitivity).toBeChecked();
      const saveName =
        kind === 'diary'
          ? de.memory.save
          : kind === 'heart'
            ? storyProducts.heartMomentProduct.save
            : m5s3.common.save;
      await page.getByRole('button', { name: saveName, exact: true }).click();
      const resourceKind =
        kind === 'diary'
          ? 'memories'
          : kind === 'heart'
            ? 'heart-moments'
            : 'plans';
      await expect(page).toHaveURL(
        new RegExp(`/${resourceKind}/composer-created-${resourceKind}$`),
      );
      const saved = state.resources.get(
        `${resourceKind}/composer-created-${resourceKind}`,
      );
      if (!saved) throw new Error('The confirmed parent must be readable.');
      expect(saved.selectedCoverAttachmentId).toBe('composer-upload-2');
      expect(saved.attachments).toHaveLength(2);
      expect(
        (saved.attachments as Array<{ id: string; isSensitive: boolean }>).find(
          (item) => item.id === 'composer-upload-2',
        )?.isSensitive,
      ).toBe(true);
      expect(
        state.calls.filter(
          (call) =>
            call.method === 'POST' && call.path.endsWith(`/${resourceKind}`),
        ),
      ).toHaveLength(1);
      expect(state.unexpected).toEqual([]);
    });
  }
}

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
      await expect(page.locator('.memory-photo-reactions')).toHaveText('❤️');
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

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`gallery icon actions and position feedback retain keyboard privacy and compact replies with ${motion}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: motion });
    const state = await installPageComposerFixture(page);
    await signIn(page);
    await page.goto('/story/memories/mem-canal');
    const carousel = page.locator('.media-gallery-carousel').first();
    const react = carousel.getByRole('button', {
      name: photoReactions.open,
      exact: true,
    });
    // The comment field sits below the photos; no shortcut is laid over them.
    await expect(
      carousel.getByRole('button', {
        name: storyProducts.comments.write,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(react).toHaveText('');
    await expect(react).toBeInViewport({ ratio: 1 });
    const positions = page.locator('.media-gallery-position');
    await positions.getByRole('button').nth(1).click();
    await expect(positions.getByRole('button').nth(1)).toHaveAttribute(
      'aria-current',
      'true',
    );
    const marker = positions.locator('.media-gallery-position-marker').first();
    const [inactiveDot, selectedDot] = await positions
      .locator('button > span')
      .evaluateAll((dots) =>
        dots.map((dot) => dot.getBoundingClientRect().width),
      );
    if (inactiveDot === undefined || selectedDot === undefined)
      throw new Error('Position dots did not render');
    if (motion === 'reduce') {
      await expect(marker).toBeHidden();
      expect(selectedDot).toBeGreaterThan(inactiveDot);
    } else {
      expect(selectedDot).toBe(inactiveDot);
      await expect(marker).toBeVisible();
      await expect
        .poll(() =>
          marker.evaluate((node) => {
            const active = node.parentElement?.querySelector(
              'button[aria-current]',
            );
            if (!active) return Number.POSITIVE_INFINITY;
            const pill = node.getBoundingClientRect();
            const button = active.getBoundingClientRect();
            return Math.abs(
              pill.x + pill.width / 2 - (button.x + button.width / 2),
            );
          }),
        )
        .toBeLessThanOrEqual(1);
    }
    const active = carousel.locator('.media-gallery-carousel-slide.is-active');
    const reveal = carousel.getByRole('button', {
      name: sensitiveMedia.show,
      exact: true,
    });
    await reveal.click();
    const hide = carousel.getByRole('button', {
      name: sensitiveMedia.hide,
      exact: true,
    });
    await expect(hide).toBeVisible();
    await expect(active).toBeFocused();
    await expect(hide).toHaveText('');
    const [photoBounds, hideBounds] = await Promise.all([
      carousel.boundingBox(),
      hide.boundingBox(),
    ]);
    if (!photoBounds || !hideBounds)
      throw new Error('Photo and hide action must be visible');
    expect(hideBounds.x).toBeGreaterThanOrEqual(photoBounds.x);
    expect(hideBounds.y).toBeGreaterThanOrEqual(photoBounds.y);
    expect(hideBounds.x + hideBounds.width).toBeLessThanOrEqual(
      photoBounds.x + photoBounds.width,
    );
    expect(hideBounds.y + hideBounds.height).toBeLessThanOrEqual(
      photoBounds.y + photoBounds.height,
    );
    await capture(page, info, `gallery-icon-actions-${motion}`);
    await hide.click();
    await expect(active).toBeFocused();
    await expect(active.locator('.sensitive-media-cover')).toBeVisible();
    const input = page.locator('.comment-form-compact textarea');
    await expect(input).toHaveAttribute('rows', '2');
    await input.focus();
    await expect(input).toBeFocused();
    if (motion === 'no-preference')
      await capture(page, info, 'gallery-compact-reply');
    await input.fill('A thought we keep while browsing');
    await positions.getByRole('button').first().click();
    await expect(input).toHaveValue('A thought we keep while browsing');
    await noOverflow(page);
    const memory = state.resources.get('memories/mem-canal');
    if (!memory) throw new Error('The fixture must contain a Memory');
    const photos = memory.attachments as Array<Record<string, unknown>>;
    memory.attachments = [
      {
        ...photos[0],
        mediaType: 'VIDEO',
        mimeType: 'video/mp4',
        durationSeconds: 4,
      },
      photos[1],
    ];
    await page.reload();
    await expect(carousel.locator('.is-active .video-poster')).toBeVisible();
    await expect(react).toHaveCount(0);
    await expect(
      carousel.getByRole('button', {
        name: storyProducts.comments.write,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(input).toBeVisible();
    expect(state.unexpected).toEqual([]);
  });
}

test('Diary photo entry opens the shared source sheet when an external provider is connected (#1790)', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await installPageComposerFixture(page);
  await signIn(page);
  await page.goto('/story/memories/new');
  await expect(
    page.getByRole('button', { name: photoSources.more, exact: true }),
  ).toHaveCount(0);
  await expect(tool(page, composer.photo)).toHaveCount(0);
  const entry = page.getByRole('button', {
    name: composer.addPhotos,
    exact: true,
  });
  await expect(entry).toHaveAttribute('aria-haspopup', 'dialog');
  await entry.click();
  const sheet = page.getByRole('dialog', {
    name: photoSources.title,
    exact: true,
  });
  await expect(
    sheet.getByRole('button', { name: photoSources.immich, exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: photoSources.device, exact: true }),
  ).toBeVisible();
  await capture(page, info, 'diary-photo-sources');
  await page.keyboard.press('Escape');
  await expect(entry).toBeFocused();
  const title = page.locator('input[name="title"]');
  const body = page.locator('textarea[name="body"]');
  for (const field of [title, body]) {
    await field.focus();
    await expect(field).toHaveCSS('outline-width', '2px');
    expect(
      await field.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).borderTopLeftRadius),
      ),
    ).toBeGreaterThan(0);
  }
  await body.fill('A quiet evening at the lake.');
  await expect(body).toHaveCSS('outline-style', 'solid');
  await captureScreenshot(page, info, '1730-rounded-writing-focus.png');
  expect(state.unexpected).toEqual([]);
});

for (const pointer of ['mouse', 'touch', 'keyboard'] as const) {
  test(`Diary composer sorts photo thumbnails with ${pointer} drag and saves the new order`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await installPageComposerFixture(page);
    const memory = state.resources.get('memories/mem-canal');
    if (!memory) throw new Error('The fixture must contain a Memory');
    memory.selectedCoverAttachmentId = 'composer-photo-1';
    await signIn(page);
    await page.goto('/story/memories/mem-canal/edit');
    await settleDraftPhotos(page);
    const tiles = page.locator('.photo-draft-grid .photo-draft-tile');
    await expect(tiles).toHaveCount(2);
    const order = () =>
      tiles.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-media-key')),
      );
    const before = await order();
    await tiles.nth(1).scrollIntoViewIfNeeded();
    const [source, target] = await Promise.all([
      tiles.nth(1).boundingBox(),
      tiles.first().boundingBox(),
    ]);
    if (!source || !target)
      throw new Error('Both photo thumbnails must be visible');
    const from = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    };
    const to = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    };
    if (pointer === 'mouse') {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 12 });
      await page.mouse.up();
    } else if (pointer === 'touch') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [from],
      });
      await expect(page.locator('[data-dnd-dragging="true"]')).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [to],
      });
      await expect(
        page.locator('.photo-draft-item.is-drop-target'),
      ).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
    } else {
      await tiles.nth(1).focus();
      await page.keyboard.press('Space');
      await expect(page.locator('[data-dnd-dragging="true"]')).toBeVisible();
      for (let step = 0; step < Math.ceil((from.x - to.x) / 10); step++)
        await page.keyboard.press('ArrowLeft');
      await expect(
        page.locator('.photo-draft-item.is-drop-target'),
      ).toBeVisible();
      await page.keyboard.press('Space');
    }
    await expect.poll(order).toEqual([...before].reverse());
    await page
      .getByRole('button', { name: memoryProduct.save, exact: true })
      .click();
    await expect(page).toHaveURL('/story/memories/mem-canal');
    const saved = state.resources.get('memories/mem-canal');
    expect(saved?.attachments).toMatchObject([
      { id: 'composer-photo-2' },
      { id: 'composer-photo-1' },
    ]);
    expect(saved?.selectedCoverAttachmentId).toBe('composer-photo-1');
    expect(state.unexpected).toEqual([]);
  });
}

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
  test(`${name} accepts photo drops on writing and images and retains words`, async ({
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
    const second = await page.evaluateHandle(
      (bytes) => {
        const data = new DataTransfer();
        data.items.add(
          new File([Uint8Array.from(bytes)], 'another-lake.jpg', {
            type: 'image/jpeg',
          }),
        );
        return data;
      },
      [...photo],
    );
    await page
      .locator('.media-gallery-carousel-slide.is-active')
      .dispatchEvent('drop', { dataTransfer: second });
    await expect(page.locator('.photo-draft-tile')).toHaveCount(2);
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
    await expect(page.locator('.photo-draft-tile')).toHaveCount(2);
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
  const editedTitle = 'Evening walk';
  const titleInput = page.locator('#plan-edit-title');
  await titleInput.fill(editedTitle);
  const descenderClearance = await titleInput.evaluate(
    async (input: HTMLInputElement) => {
      await document.fonts.ready;
      const style = getComputedStyle(input);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas text metrics are unavailable');
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = context.measureText(input.value);
      const fontHeight =
        metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
      const lineHeight =
        style.lineHeight === 'normal'
          ? fontHeight
          : Number.parseFloat(style.lineHeight);
      return (
        metrics.fontBoundingBoxDescent +
        (lineHeight - fontHeight) / 2 -
        metrics.actualBoundingBoxDescent
      );
    },
  );
  expect(descenderClearance).toBeGreaterThanOrEqual(0);
  const sources = await openComposerMediaSources(page);
  await capture(page, info, 'plan-photo-source-sheet');
  await page.keyboard.press('Escape');
  await expect(sources).toHaveCount(0);
  const schedule = await showPlanSchedule(page);
  await capture(page, info, 'plan-schedule-sheet-frame-11');
  await expect(schedule.locator('input[type="date"]').first()).toHaveValue(
    '2026-11-21',
  );
  await schedule
    .getByRole('button', { name: m5s3.plan.unschedule, exact: true })
    .click();
  await expect(schedule.locator('input[type="date"]').first()).toHaveValue('');
  for (const time of await schedule.locator('input[type="time"]').all())
    await expect(time).toHaveValue('');
  await closePlanSchedule(page);
  await expect(page.locator('.composer-schedule-trigger')).toContainText(
    m5s3.overview.undatedHeading,
  );
  await tool(page, composer.list).click();
  await capture(page, info, 'plan-list-choice');
  await closeChoice(page);
  await page
    .getByRole('button', { name: m5s3.common.saveChanges, exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/plans\/composer-plan$/);
  await expect(
    page.getByRole('heading', { name: editedTitle, exact: true }),
  ).toBeVisible();
  expect(
    state.calls.find(
      (call) =>
        call.method === 'PATCH' && call.path.endsWith('/plans/composer-plan'),
    )?.body.schedule,
  ).toBeNull();
  expect(state.resources.get('plans/composer-plan')?.plannedStart).toBeNull();
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

test('detail Places restore their map invoker without consuming a later clean editor return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
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
    expect(before).toBeGreaterThan(0);
    await place.click();
    await expect(page).toHaveURL(/\/story\/map\?place=49.56%3A7.07$/);
    await page
      .getByRole('button', { name: taskBoundary.back, exact: true })
      .or(page.getByRole('link', { name: taskBoundary.back, exact: true }))
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(place).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(before, 0);
    if (path.startsWith('/plan/')) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const editorOrigin = await page.evaluate(() => window.scrollY);
      expect(editorOrigin).toBe(0);
      expect(editorOrigin).not.toBe(before);
      const editLabel = m5s3.common.edit;
      const edit = page
        .getByRole('button', { name: editLabel, exact: true })
        .or(page.getByRole('link', { name: editLabel, exact: true }));
      await expect(edit).toBeInViewport();
      await edit.click();
      await expect(page.locator('.page-composer').last()).toBeVisible();
      const close = page.locator('.composer-header .task-back-control:visible');
      await expect(close).toHaveCount(1);
      await expect(close).toHaveAccessibleName(taskBoundary.close);
      await close.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await waitForSettledMotion(page);
      await expect(edit).toBeFocused();
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeCloseTo(editorOrigin, 0);
    }
  }
  expect(state.unexpected).toEqual([]);
});
