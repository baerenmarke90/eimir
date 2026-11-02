// @vitest-environment jsdom
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { AttachmentDraft } from '../client/attachmentDraftState';
import { i18n } from '../i18n';
import {
  PhotoDraftGallery,
  type PhotoDraftGalleryItem,
} from './PhotoDraftGallery';

afterEach(cleanup);

function Harness() {
  const [items, setItems] = useState<PhotoDraftGalleryItem[]>(() =>
    Array.from({ length: 10 }, (_, index) => ({
      key: `photo-${index}`,
      name: `camera-${index}.jpg`,
      preview: <span>Preview</span>,
      isSensitive: index === 2,
      draft: {
        id: `photo-${index}`,
        file: new File(['photo'], `camera-${index}.jpg`, {
          type: 'image/jpeg',
        }),
        previewUrl: 'blob:photo',
        status: index === 9 ? 'failed' : 'ready',
        progress: 100,
        attempt: 1,
        attachmentId: `attachment-${index}`,
        error: index === 9 ? 'A safe validation message' : undefined,
      } as AttachmentDraft,
    })),
  );
  return (
    <PhotoDraftGallery
      items={items}
      onMove={(key, offset) =>
        setItems((old) => {
          const next = [...old];
          const from = next.findIndex((item) => item.key === key);
          [next[from], next[from + offset]] = [next[from + offset], next[from]];
          return next;
        })
      }
      onSensitive={(key, value) =>
        setItems((old) =>
          old.map((item) =>
            item.key === key ? { ...item, isSensitive: value } : item,
          ),
        )
      }
      onRetry={(key) =>
        setItems((old) =>
          old.map((item) =>
            item.key === key && item.draft
              ? {
                  ...item,
                  draft: { ...item.draft, status: 'ready', error: undefined },
                }
              : item,
          ),
        )
      }
      onRemove={(key) =>
        setItems((old) => old.filter((item) => item.key !== key))
      }
    />
  );
}

it('keeps a bounded overview, exposes offscreen failures and retries the selected identity', () => {
  render(<Harness />);
  const list = screen.getByRole('list', {
    name: i18n.t('memory.photoDraftsAria'),
  });
  expect(within(list).getAllByRole('button')).toHaveLength(6);
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByRole('alert').textContent).toContain(
    i18n.t('memory.photoFailures', { count: 1 }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('memory.photoReviewFailure') }),
  );
  expect(within(list).getAllByRole('button')).toHaveLength(10);
  expect(screen.getByText('camera-9.jpg')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('camera-9.jpg')).toBeTruthy();
});

it('reorders the selected photo without losing selection, sensitivity or ready status', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /camera-2.jpg/ }));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(
    screen.getByRole('button', {
      name: i18n.t('memory.photoMoveEarlier', { name: 'camera-2.jpg' }),
    }),
  );
  const selected = screen.getByRole('button', { pressed: true });
  expect(selected.getAttribute('aria-label')).toBe(
    i18n.t('memory.photoSelectItem', {
      name: 'camera-2.jpg',
      position: 2,
      count: 10,
      status: i18n.t('memory.photoReady'),
    }),
  );
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: i18n.t('memory.photoRemove') }),
  );
  expect(screen.queryByText('camera-2.jpg')).toBeNull();
  expect(screen.getByText('camera-1.jpg')).toBeTruthy();
});
