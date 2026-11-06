// @vitest-environment jsdom
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
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
    view.container
      .querySelectorAll('.photo-draft-sensitive')[1]
      .getAttribute('aria-checked'),
  ).toBe('true');
  expect(screen.queryByText(i18n.t('memory.photoReady'))).toBeNull();
  expect(screen.queryByText(i18n.t('experiences.chooseCover'))).toBeNull();
  expect(screen.queryByText(i18n.t('memory.photoRemove'))).toBeNull();
  expect(view.container.querySelector('button button')).toBeNull();
});

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
  for (const button of screen.getAllByRole('button')) fireEvent.click(button);
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
