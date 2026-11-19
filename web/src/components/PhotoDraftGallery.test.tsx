// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { AttachmentDraft } from '../client/attachmentDraftState';
import { i18n } from '../i18n';
import {
  PhotoDraftGallery,
  type PhotoDraftGalleryItem,
} from './PhotoDraftGallery';

afterEach(cleanup);
const items: PhotoDraftGalleryItem[] = ['first', 'second', 'third'].map(
  (key) => ({
    key,
    name: `${key}.jpg`,
    preview: <span>Preview</span>,
    isSensitive: false,
  }),
);
const chosen = () =>
  screen.getByRole('group', { name: i18n.t('memory.photoSelected') });

function Harness() {
  const [photos, setPhotos] = useState(items);
  const [cover, setCover] = useState<string | null>(null);
  return (
    <PhotoDraftGallery
      items={photos}
      selectedCoverKey={cover}
      onSelectCover={setCover}
      onSensitive={(key, value) =>
        setPhotos((old) =>
          old.map((item) =>
            item.key === key ? { ...item, isSensitive: value } : item,
          ),
        )
      }
      onRemove={(key) =>
        setPhotos((old) => old.filter((item) => item.key !== key))
      }
    />
  );
}

function renderComposer(initialItems = items, composer = true) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const cover = vi.fn();
  const order = vi.fn();
  const sensitive = vi.fn();
  const remove = vi.fn();
  const retry = vi.fn();
  function Composer() {
    const [photos, setPhotos] = useState(initialItems);
    const [selectedCoverKey, setCover] = useState<string | null>(null);
    return (
      <PhotoDraftGallery
        items={photos}
        addAction={
          composer ? <button type="button">Add photos</button> : undefined
        }
        selectedCoverKey={selectedCoverKey}
        onSelectCover={(key) => {
          cover(key);
          setCover(key);
        }}
        onSensitive={(key, value) => {
          sensitive(key, value);
          setPhotos((old) =>
            old.map((item) =>
              item.key === key ? { ...item, isSensitive: value } : item,
            ),
          );
        }}
        onOrderChange={(keys) => {
          order(keys);
          setPhotos((old) =>
            keys.flatMap((key) => old.filter((item) => item.key === key)),
          );
        }}
        onRemove={(key) => {
          remove(key);
          setPhotos((old) => old.filter((item) => item.key !== key));
        }}
        onRetry={retry}
      />
    );
  }
  const view = render(
    <MemoryRouter>
      <Composer />
    </MemoryRouter>,
  );
  const strip = () =>
    view.container.querySelector('.photo-draft-grid') as HTMLOListElement;
  const tiles = () => [
    ...strip().querySelectorAll<HTMLButtonElement>('.photo-draft-tile'),
  ];
  const keys = () => tiles().map((tile) => tile.dataset.mediaKey);
  const coverKey = () =>
    strip()
      .querySelector(
        '.photo-draft-cover-star, .photo-draft-cover-toggle[aria-pressed="true"]',
      )
      ?.closest('.photo-draft-frame')
      ?.querySelector<HTMLButtonElement>('.photo-draft-tile')?.dataset.mediaKey;
  return {
    ...view,
    cover,
    order,
    sensitive,
    remove,
    retry,
    strip,
    tiles,
    keys,
    coverKey,
  };
}

it('keeps composer stage controls present while thumbnail selection only changes the preview', () => {
  const view = renderComposer();
  const stage = () => within(chosen());
  expect(stage().getByText(i18n.t('experiences.cover'))).toBeTruthy();
  expect(
    stage().getByRole('button', { name: i18n.t('memory.photoRemove') }),
  ).toBeTruthy();
  expect(
    stage().getByRole('checkbox', {
      name: `${i18n.t('sensitiveMedia.mark')}: first.jpg`,
    }),
  ).toBeTruthy();
  const counter = () =>
    chosen().querySelector('.media-gallery-carousel-counter');
  expect(counter()?.textContent).toBe(
    i18n.t('gallery.counter', { index: 1, count: 3 }),
  );
  expect(view.coverKey()).toBe('first');
  expect(within(view.strip()).getAllByRole('button')).toHaveLength(4);
  expect(within(view.strip()).queryByRole('checkbox')).toBeNull();
  expect(
    view
      .strip()
      .querySelector(
        '.photo-draft-cover-toggle, .photo-draft-remove, .photo-draft-sensitive',
      ),
  ).toBeNull();

  fireEvent.click(view.tiles()[1]);
  expect(view.tiles()[1].getAttribute('aria-pressed')).toBe('true');
  expect(counter()?.textContent).toBe(
    i18n.t('gallery.counter', { index: 2, count: 3 }),
  );
  expect(view.coverKey()).toBe('first');
  expect(view.cover).not.toHaveBeenCalled();
  expect(view.order).not.toHaveBeenCalled();
  expect(view.sensitive).not.toHaveBeenCalled();
  expect(view.container.querySelector('.is-managing')).toBeNull();
  expect(
    screen.queryByRole('button', { name: i18n.t('experiences.finish') }),
  ).toBeNull();
  expect(view.container.querySelector('.photo-draft-inspector')).toBeNull();
  expect(within(view.strip()).getAllByRole('button')).toHaveLength(4);

  fireEvent.click(
    chosen().querySelector(
      'button.photo-draft-stage-cover',
    ) as HTMLButtonElement,
  );
  expect(view.cover).toHaveBeenCalledExactlyOnceWith('second');
  expect(view.coverKey()).toBe('second');
  expect(chosen().querySelector('button.photo-draft-stage-cover')).toBeNull();
  expect(stage().getByText(i18n.t('experiences.cover'))).toBeTruthy();
  fireEvent.click(
    stage().getByRole('checkbox', {
      name: `${i18n.t('sensitiveMedia.mark')}: second.jpg`,
    }),
  );
  expect(view.sensitive).toHaveBeenCalledExactlyOnceWith('second', true);
  expect(
    stage().getByRole('checkbox', {
      name: `${i18n.t('sensitiveMedia.mark')}: second.jpg`,
      checked: true,
    }),
  ).toBeTruthy();
  expect(view.order).not.toHaveBeenCalled();
  for (const name of ['experiences.arrange', 'experiences.automaticCover'])
    expect(screen.queryByRole('button', { name: i18n.t(name) })).toBeNull();
  expect(
    chosen().querySelector(
      '.media-gallery-carousel > .sensitive-media-control',
    ),
  ).toBeNull();
  expect(view.container.querySelector('button button')).toBeNull();
});

it('removes the stage identity and selects the next surviving neighbor without changing canonical order', () => {
  const view = renderComposer();
  fireEvent.click(view.tiles()[1]);
  fireEvent.click(
    chosen().querySelector(
      'button.photo-draft-stage-cover',
    ) as HTMLButtonElement,
  );
  const remove = () =>
    fireEvent.click(
      within(chosen()).getByRole('button', {
        name: i18n.t('memory.photoRemove'),
      }),
    );
  remove();
  expect(view.remove).toHaveBeenCalledExactlyOnceWith('second');
  expect(view.keys()).toEqual(['first', 'third']);
  expect(view.tiles()[1].getAttribute('aria-pressed')).toBe('true');
  expect(view.coverKey()).toBe('first');
  remove();
  expect(view.keys()).toEqual(['first']);
  expect(view.tiles()[0].getAttribute('aria-pressed')).toBe('true');
  expect(
    chosen().querySelector('.media-gallery-carousel-counter')?.textContent,
  ).toBe(i18n.t('gallery.counter', { index: 1, count: 1 }));
  remove();
  expect(view.remove.mock.calls).toEqual([['second'], ['third'], ['first']]);
  expect(
    screen.queryByRole('group', { name: i18n.t('memory.photoSelected') }),
  ).toBeNull();
  expect(view.order).not.toHaveBeenCalled();
});

it('retries the exact failed composer item on the stage without per-tile or duplicate retry controls', () => {
  const failed = {
    ...items[1],
    key: 'failed-photo-key',
    draft: {
      id: 'failed-photo-key',
      file: new File(['selected photo'], 'second.jpg', { type: 'image/jpeg' }),
      status: 'failed',
      progress: 0,
      attempt: 1,
      error: 'The selected photo can be retried.',
    } as AttachmentDraft,
  };
  const view = renderComposer([items[0], failed]);
  fireEvent.click(view.tiles()[1]);
  expect(screen.getByText('The selected photo can be retried.')).toBeTruthy();
  const retry = within(chosen()).getByRole('button', {
    name: i18n.t('common.retry'),
  });
  expect(retry.classList.contains('photo-draft-stage-retry')).toBe(true);
  expect(
    screen.getAllByRole('button', { name: i18n.t('common.retry') }),
  ).toHaveLength(1);
  fireEvent.click(retry);
  expect(view.retry).toHaveBeenCalledExactlyOnceWith('failed-photo-key');
  expect(view.keys()).toEqual(['first', 'failed-photo-key']);
  expect(view.order).not.toHaveBeenCalled();
  expect(view.cover).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps legacy arrangement Cancel/Finish and automatic cover reset unchanged', async () => {
  const view = renderComposer(items, false);
  const arrange = () =>
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('experiences.arrange') }),
    );
  const moveThirdFirst = () => {
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: `${i18n.t('memory.photoPosition', { position: 3, count: 3 })}: third.jpg`,
      }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: i18n.t('experiences.first') }),
    );
    expect(
      within(within(dialog).getAllByRole('listitem')[0]).getByRole('button', {
        name: `${i18n.t('memory.photoPosition', { position: 1, count: 3 })}: third.jpg`,
      }),
    ).toBeTruthy();
    expect(view.order).not.toHaveBeenCalled();
  };
  arrange();
  moveThirdFirst();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: i18n.t('experiences.cancel'),
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(view.keys()).toEqual(['first', 'second', 'third']);
  expect(view.order).not.toHaveBeenCalled();
  arrange();
  moveThirdFirst();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: i18n.t('experiences.finish'),
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(view.order).toHaveBeenCalledExactlyOnceWith([
    'third',
    'first',
    'second',
  ]);
  expect(view.keys()).toEqual(['third', 'first', 'second']);
  expect(view.coverKey()).toBe('third');
  fireEvent.click(view.tiles()[1]);
  fireEvent.click(
    within(chosen()).getByRole('button', {
      name: i18n.t('experiences.chooseCover'),
    }),
  );
  expect(view.coverKey()).toBe('first');
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('experiences.automaticCover') }),
  );
  expect(view.cover.mock.calls).toEqual([['first'], [null]]);
  expect(view.coverKey()).toBe('third');
  expect(view.keys()).toEqual(['third', 'first', 'second']);
});

it('keeps image selection independent from direct cover and sensitivity controls', () => {
  const view = render(<Harness />);
  const tiles = () => view.container.querySelectorAll('.photo-draft-tile');
  fireEvent.click(tiles()[1]);
  expect(tiles()[1].getAttribute('aria-pressed')).toBe('true');
  expect(
    view.container
      .querySelector('.photo-draft-cover-toggle[aria-pressed="true"]')
      ?.closest('li')?.textContent,
  ).toContain('1');
  fireEvent.click(
    within(chosen()).getByRole('button', {
      name: i18n.t('experiences.chooseCover'),
    }),
  );
  expect(tiles()[1].getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(
    within(chosen()).getByRole('checkbox', {
      name: i18n.t('sensitiveMedia.mark'),
    }),
  );
  expect(
    within(chosen()).getByRole('checkbox', {
      name: i18n.t('sensitiveMedia.mark'),
      checked: true,
    }),
  ).toBeTruthy();
  fireEvent.click(tiles()[2]);
  expect(tiles()[2].getAttribute('aria-pressed')).toBe('true');
  expect(
    view.container
      .querySelectorAll('.photo-draft-cover-toggle')[1]
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    (
      view.container.querySelectorAll(
        '.photo-draft-sensitive input',
      )[1] as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(screen.queryByText(i18n.t('memory.photoReady'))).toBeNull();
  expect(
    within(
      view.container.querySelector('.photo-draft-toolbar') as HTMLElement,
    ).getByRole('button', { name: i18n.t('experiences.chooseCover') }),
  ).toBeTruthy();
  expect(screen.queryByText(i18n.t('memory.photoRemove'))).toBeNull();
  expect(view.container.querySelector('button button')).toBeNull();
});

it.each(['de', 'en'])(
  'offers honest recovery for an unadmitted video in %s',
  async (locale) => {
    const language = i18n.language;
    const retry = vi.fn();
    const file = new File(['selected video'], 'selected.mp4', {
      type: 'video/mp4',
    });
    try {
      await i18n.changeLanguage(locale);
      render(
        <PhotoDraftGallery
          items={[
            {
              key: 'video',
              name: file.name,
              preview: <span>Video preview</span>,
              isSensitive: false,
              draft: {
                id: 'video',
                file,
                previewUrl: '',
                status: 'failed',
                attempt: 1,
                progress: 0,
                error: i18n.t('video.startFailed'),
              },
            },
          ]}
          onRemove={vi.fn()}
          onRetry={retry}
        />,
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('memory.photoReviewFailure'),
        }),
      );
      expect(screen.getByText(i18n.t('video.startFailed'))).toBeTruthy();
      expect(screen.getByText(i18n.t('video.failedNotSaved'))).toBeTruthy();
      expect(screen.queryByText(i18n.t('flow.uploadFailed'))).toBeNull();
      expect(
        screen.queryByText(
          /You can save your moment now|kann schon gespeichert/,
        ),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('common.retry') }),
      );
      expect(retry).toHaveBeenCalledExactlyOnceWith('video');
    } finally {
      cleanup();
      await i18n.changeLanguage(language);
    }
  },
);

it('removes the clicked identity and restores the first cover without changing another selection', () => {
  const view = render(<Harness />);
  const tiles = () => view.container.querySelectorAll('.photo-draft-tile');
  fireEvent.click(tiles()[1]);
  fireEvent.click(
    within(chosen()).getByRole('button', {
      name: i18n.t('experiences.chooseCover'),
    }),
  );
  fireEvent.click(tiles()[2]);
  fireEvent.click(
    within(screen.getByRole('group', { name: 'second.jpg' })).getByRole(
      'button',
      { name: i18n.t('memory.photoRemove') },
    ),
  );
  expect(tiles()).toHaveLength(2);
  expect(tiles()[1].getAttribute('aria-pressed')).toBe('true');
  expect(
    view.container
      .querySelector('.photo-draft-cover-toggle')
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(
    within(chosen()).getByRole('button', {
      name: i18n.t('memory.photoRemove'),
    }),
  );
  expect(tiles()).toHaveLength(1);
  expect(tiles()[0].getAttribute('aria-pressed')).toBe('true');
});

it('retains per-item classification and removal authority and disables mutations during save', () => {
  const remove = vi.fn(),
    sensitive = vi.fn(),
    cover = vi.fn();
  const props = {
    items: [{ ...items[0], canEditSensitivity: false, canRemove: false }],
    onRemove: remove,
    onSensitive: sensitive,
    onSelectCover: cover,
  };
  const view = render(<PhotoDraftGallery {...props} />);
  expect(
    screen
      .getByRole('checkbox', { name: i18n.t('sensitiveMedia.mark') })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.queryByRole('button', { name: i18n.t('memory.photoRemove') }),
  ).toBeNull();
  view.rerender(<PhotoDraftGallery {...props} items={items} disabled />);
  for (const button of [
    ...screen.getAllByRole('button'),
    ...screen.getAllByRole('checkbox'),
  ])
    fireEvent.click(button);
  expect(remove).not.toHaveBeenCalled();
  expect(sensitive).not.toHaveBeenCalled();
  expect(cover).not.toHaveBeenCalled();
});

it('reveals failures beyond the bounded overview and retries without a second task', () => {
  const retry = vi.fn();
  const photos = Array.from({ length: 10 }, (_, index) => ({
    ...items[0],
    key: String(index),
    name: `camera-${index}.jpg`,
    draft: {
      id: String(index),
      file: new File(['photo'], `camera-${index}.jpg`, { type: 'image/jpeg' }),
      status: index === 9 ? 'failed' : 'ready',
      progress: 100,
      attempt: 1,
      error: index === 9 ? 'A safe validation message' : undefined,
    } as AttachmentDraft,
  }));
  const view = render(
    <PhotoDraftGallery items={photos} onRemove={() => {}} onRetry={retry} />,
  );
  expect(view.container.querySelectorAll('.photo-draft-tile')).toHaveLength(6);
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('memory.photoReviewFailure') }),
  );
  expect(view.container.querySelectorAll('.photo-draft-tile')).toHaveLength(10);
  expect(screen.getByText('A safe validation message')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }));
  expect(retry).toHaveBeenCalledExactlyOnceWith('9');
  expect(screen.queryByRole('dialog')).toBeNull();
});
