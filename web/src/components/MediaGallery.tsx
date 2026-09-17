import { useEffect, useRef, useState } from 'react';
import {
  MediaType,
  type MediaType as MediaTypeValue,
} from '../api/generated/models/MediaType';
import { useTranslation } from '../i18n';

export interface GalleryMediaItem {
  id: string;
  mediaType: MediaTypeValue;
}

export function MediaGallery({
  items,
  loadMedia,
}: {
  items: GalleryMediaItem[];
  loadMedia: (attachmentId: string) => Promise<string>;
}) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const carouselTouchStartX = useRef<number | null>(null);
  const lightboxTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const loadedUrls: string[] = [];
    setUrls({});
    setFailed(new Set());
    setCarouselIndex(0);

    for (const item of items) {
      if (item.mediaType === MediaType.VIDEO) continue;
      void loadMedia(item.id)
        .then((url) => {
          if (!active) {
            URL.revokeObjectURL(url);
            return;
          }
          loadedUrls.push(url);
          setUrls((current) => ({ ...current, [item.id]: url }));
        })
        .catch(() => {
          if (!active) return;
          setFailed((current) => new Set(current).add(item.id));
        });
    }

    return () => {
      active = false;
      for (const url of loadedUrls) URL.revokeObjectURL(url);
    };
  }, [items, loadMedia]);

  useEffect(() => {
    if (carouselIndex < items.length) return;
    setCarouselIndex(Math.max(0, items.length - 1));
  }, [carouselIndex, items.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null);
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) =>
          current === null ? null : (current - 1 + items.length) % items.length,
        );
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) =>
          current === null ? null : (current + 1) % items.length,
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items.length]);

  if (items.length === 0) return null;

  function changeCarousel(delta: number) {
    setCarouselIndex(
      (current) => (current + delta + items.length) % items.length,
    );
  }

  function changeActive(delta: number) {
    setActiveIndex((current) => {
      if (current === null) return null;
      return (current + delta + items.length) % items.length;
    });
  }

  function renderMedia(item: GalleryMediaItem, className: string) {
    if (item.mediaType === MediaType.VIDEO || failed.has(item.id)) {
      return (
        <div className="media-gallery-unavailable">
          {t('media.unavailable')}
        </div>
      );
    }
    const url = urls[item.id];
    if (!url) {
      return (
        <div
          className="media-gallery-loading"
          role="status"
          aria-label={t('media.loading')}
        />
      );
    }
    return <img className={className} src={url} alt={t('gallery.imageAlt')} />;
  }

  const activeItem = activeIndex === null ? null : items[activeIndex];

  return (
    <>
      <section
        className="media-gallery-carousel"
        aria-label={t('gallery.aria')}
      >
        <div
          className="media-gallery-carousel-viewport"
          onTouchStart={(event) => {
            carouselTouchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = carouselTouchStartX.current;
            carouselTouchStartX.current = null;
            const end = event.changedTouches[0]?.clientX;
            if (start === null || end === undefined || items.length < 2) return;
            const distance = end - start;
            if (Math.abs(distance) < 48) return;
            changeCarousel(distance > 0 ? -1 : 1);
          }}
        >
          <div
            className="media-gallery-carousel-track"
            style={{ transform: `translate3d(-${carouselIndex * 100}%, 0, 0)` }}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="media-gallery-carousel-slide"
                tabIndex={index === carouselIndex ? 0 : -1}
                onClick={() => setActiveIndex(index)}
                aria-label={t('gallery.openItem', {
                  index: index + 1,
                  count: items.length,
                })}
              >
                {renderMedia(item, 'media-gallery-carousel-content')}
              </button>
            ))}
          </div>

          {items.length > 1 ? (
            <>
              <button
                type="button"
                className="media-gallery-carousel-nav media-gallery-carousel-prev"
                onClick={() => changeCarousel(-1)}
                aria-label={t('gallery.previous')}
              >
                ‹
              </button>
              <button
                type="button"
                className="media-gallery-carousel-nav media-gallery-carousel-next"
                onClick={() => changeCarousel(1)}
                aria-label={t('gallery.next')}
              >
                ›
              </button>
            </>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className="media-gallery-carousel-footer">
            <span className="media-gallery-carousel-counter" aria-live="polite">
              {t('gallery.counter', {
                index: carouselIndex + 1,
                count: items.length,
              })}
            </span>
            <div className="media-gallery-carousel-dots" aria-hidden="true">
              {items.map((item, index) => (
                <span
                  key={item.id}
                  className={`media-gallery-carousel-dot${
                    index === carouselIndex ? ' is-active' : ''
                  }`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {activeItem && activeIndex !== null ? (
        <div
          className="media-lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t('gallery.dialogAria')}
          onTouchStart={(event) => {
            lightboxTouchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = lightboxTouchStartX.current;
            lightboxTouchStartX.current = null;
            const end = event.changedTouches[0]?.clientX;
            if (start === null || end === undefined) return;
            const distance = end - start;
            if (Math.abs(distance) < 48) return;
            changeActive(distance > 0 ? -1 : 1);
          }}
        >
          <div className="media-lightbox">
            <div className="media-lightbox-toolbar">
              <span aria-live="polite">
                {t('gallery.counter', {
                  index: activeIndex + 1,
                  count: items.length,
                })}
              </span>
              <button
                ref={closeButton}
                type="button"
                className="tertiary"
                onClick={() => setActiveIndex(null)}
              >
                {t('gallery.close')}
              </button>
            </div>
            <div className="media-lightbox-stage">
              {items.length > 1 ? (
                <button
                  type="button"
                  className="media-lightbox-nav"
                  onClick={() => changeActive(-1)}
                  aria-label={t('gallery.previous')}
                >
                  ‹
                </button>
              ) : null}
              {renderMedia(activeItem, 'media-lightbox-content')}
              {items.length > 1 ? (
                <button
                  type="button"
                  className="media-lightbox-nav"
                  onClick={() => changeActive(1)}
                  aria-label={t('gallery.next')}
                >
                  ›
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
