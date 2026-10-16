// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaType } from '../api/generated/models/MediaType';
import { i18n } from '../i18n';
import { MediaGallery } from './MediaGallery';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('MediaGallery lightbox focus contract', () => {
  it('contains keyboard focus in the modal lightbox and restores the opener on close', async () => {
    const loadMedia = vi.fn(async () => 'blob:unused');
    render(
      <MediaGallery
        items={[
          { id: 'video-1', mediaType: MediaType.VIDEO },
          { id: 'video-2', mediaType: MediaType.VIDEO },
        ]}
        loadMedia={loadMedia}
      />,
    );

    const opener = screen.getByRole('button', {
      name: i18n.t('gallery.openItem', { index: 1, count: 2 }),
    });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', {
      name: i18n.t('gallery.dialogAria'),
    });
    const lightbox = within(dialog);
    const closeButton = lightbox.getByRole('button', {
      name: i18n.t('gallery.close'),
    });
    const nextButton = lightbox.getByRole('button', {
      name: i18n.t('gallery.next'),
    });

    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(nextButton);

    fireEvent.keyDown(nextButton, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
    expect(loadMedia).not.toHaveBeenCalled();
  });
});
