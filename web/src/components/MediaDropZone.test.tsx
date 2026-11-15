// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { MediaDropZone } from './MediaDropZone';

afterEach(cleanup);
const photo = () =>
  new File(['image'], 'our-photo.jpg', { type: 'image/jpeg' });
const movie = () => new File(['video'], 'our-video.mp4', { type: 'video/mp4' });

function drop(element: Element, files: File[]) {
  return fireEvent.drop(element, { dataTransfer: { types: ['Files'], files } });
}

describe('local media file intake', () => {
  it('delivers supported files in their original order and retains the picker alternative', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <MediaDropZone videos onFiles={onFiles}>
        <button type="button">{i18n.t('photoSources.device')}</button>
      </MediaDropZone>,
    );
    const files = [photo(), movie()];
    expect(drop(container.firstElementChild as Element, files)).toBe(false);
    expect(onFiles).toHaveBeenCalledWith(files);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('keeps photo-only areas photo-only and reports excluded files', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <MediaDropZone onFiles={onFiles}>photo</MediaDropZone>,
    );
    const image = photo();
    drop(container.firstElementChild as Element, [movie(), image]);
    expect(onFiles).toHaveBeenCalledWith([image]);
    expect(screen.getByRole('alert').textContent).toBe(
      i18n.t('mediaDrop.supportedPhotos'),
    );
  });

  it('rejects a multi-file drop for a single avatar without replacing the current choice', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <MediaDropZone multiple={false} onFiles={onFiles}>
        photo
      </MediaDropZone>,
    );
    drop(container.firstElementChild as Element, [photo(), photo()]);
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      i18n.t('mediaDrop.single'),
    );
  });

  it('blocks dropped files while disabled and leaves ordinary dragging to its owner', () => {
    const onFiles = vi.fn();
    const { container } = render(
      <MediaDropZone disabled onFiles={onFiles}>
        photo
      </MediaDropZone>,
    );
    const element = container.firstElementChild as Element;
    expect(drop(element, [photo()])).toBe(false);
    expect(
      fireEvent.dragOver(element, { dataTransfer: { types: ['text/plain'] } }),
    ).toBe(true);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
