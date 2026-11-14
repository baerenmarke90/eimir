import { renderToStaticMarkup } from 'react-dom/server';
import { MediaType } from '../api/generated/models/MediaType';
import { i18n } from '../i18n';
import { MediaGallery } from './MediaGallery';

describe('EIMIR-M5-Web-S2-SCOPE media gallery accessibility smoke', () => {
  it('renders an accessible media-first carousel with labeled position dots', () => {
    const html = renderToStaticMarkup(
      <MediaGallery
        presentation="composer"
        items={[
          { id: 'image-1', mediaType: MediaType.IMAGE, isSensitive: false },
          { id: 'video-1', mediaType: MediaType.VIDEO, isSensitive: false },
        ]}
        loadMedia={async () => 'blob:test'}
      />,
    );

    expect(html).toContain('media-gallery-carousel');
    expect(html).toContain(`aria-label="${i18n.t('gallery.aria')}"`);
    expect(html).toContain(
      `aria-label="${i18n.t('gallery.openItem', { index: 1, count: 2 })}"`,
    );
    expect(html).toContain(
      `aria-label="${i18n.t('gallery.openItem', { index: 2, count: 2 })}"`,
    );
    expect(html).toContain(`aria-label="${i18n.t('gallery.previous')}"`);
    expect(html).toContain(`aria-label="${i18n.t('gallery.next')}"`);
    expect(html).toContain(i18n.t('gallery.fraction', { index: 1, count: 2 }));
    expect(html).toContain('media-gallery-carousel-counter');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('media-gallery-carousel-footer');
    expect(html).toContain('media-gallery-position');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('eimir-icon-chevron-left');
    expect(html).toContain('eimir-icon-chevron-right');
    expect(html.match(/type="button"/g)).toHaveLength(6);
  });

  it('renders one composer image with its count and without navigation chrome', () => {
    const html = renderToStaticMarkup(
      <MediaGallery
        presentation="composer"
        items={[
          { id: 'image-1', mediaType: MediaType.IMAGE, isSensitive: false },
        ]}
        loadMedia={async () => 'blob:test'}
      />,
    );

    expect(html).toContain(
      `aria-label="${i18n.t('gallery.openItem', { index: 1, count: 1 })}"`,
    );
    expect(html).toContain('media-gallery-carousel-counter');
    expect(html).not.toContain('media-gallery-position');
    expect(html).not.toContain(`aria-label="${i18n.t('gallery.previous')}"`);
    expect(html).not.toContain(`aria-label="${i18n.t('gallery.next')}"`);
    expect(html.match(/type="button"/g)).toHaveLength(1);
  });
});

it('preserves uncomposed gallery pagination for out-of-scope consumers', () => {
  const renderGallery = (count: number) =>
    renderToStaticMarkup(
      <MediaGallery
        items={Array.from({ length: count }, (_, index) => ({
          id: String(index),
          mediaType: MediaType.IMAGE,
          isSensitive: false,
        }))}
        loadMedia={async () => 'blob:test'}
      />,
    );
  expect(renderGallery(1)).not.toContain('media-gallery-carousel-counter');
  const multiple = renderGallery(3);
  expect(multiple).toContain(i18n.t('gallery.counter', { index: 1, count: 3 }));
  expect(multiple).not.toContain('media-gallery-position');
});
