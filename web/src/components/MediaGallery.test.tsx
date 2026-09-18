import { renderToStaticMarkup } from 'react-dom/server';
import { MediaType } from '../api/generated/models/MediaType';
import { i18n } from '../i18n';
import { MediaGallery } from './MediaGallery';

describe('EIMIR-M5-Web-S2-SCOPE media gallery accessibility smoke', () => {
  it('renders an accessible media-first carousel without footer pagination chrome', () => {
    const html = renderToStaticMarkup(
      <MediaGallery
        items={[
          { id: 'image-1', mediaType: MediaType.IMAGE },
          { id: 'video-1', mediaType: MediaType.VIDEO },
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
    expect(html).toContain(i18n.t('gallery.counter', { index: 1, count: 2 }));
    expect(html).toContain('media-gallery-carousel-counter');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('media-gallery-carousel-footer');
    expect(html).not.toContain('media-gallery-carousel-dots');
    expect(html).toContain('aria-hidden="true">‹</span>');
    expect(html).toContain('aria-hidden="true">›</span>');
    expect(html.match(/type="button"/g)).toHaveLength(4);
  });

  it('renders a single image without pagination or navigation chrome', () => {
    const html = renderToStaticMarkup(
      <MediaGallery
        items={[{ id: 'image-1', mediaType: MediaType.IMAGE }]}
        loadMedia={async () => 'blob:test'}
      />,
    );

    expect(html).toContain(
      `aria-label="${i18n.t('gallery.openItem', { index: 1, count: 1 })}"`,
    );
    expect(html).not.toContain('media-gallery-carousel-counter');
    expect(html).not.toContain(`aria-label="${i18n.t('gallery.previous')}"`);
    expect(html).not.toContain(`aria-label="${i18n.t('gallery.next')}"`);
    expect(html.match(/type="button"/g)).toHaveLength(1);
  });
});
