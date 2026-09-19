import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MediaType,
  type MediaType as MediaTypeValue,
} from '../api/generated/models/MediaType';
import { useTranslation } from '../i18n';

export interface GalleryMediaItem {
  id: string;
  mediaType: MediaTypeValue;
}

type CarouselDirection = 'previous' | 'next' | null;

interface CarouselTransitionState {
  index: number;
  outgoingIndex: number | null;
  direction: CarouselDirection;
}

const INITIAL_CAROUSEL_STATE: CarouselTransitionState = {
  index: 0,
  outgoingIndex: null,
  direction: null,
};

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
  const [carousel, setCarousel] = useState<CarouselTransitionState>(
    INITIAL_CAROUSEL_STATE,
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const carouselTouchStartX = useRef<number | null>(null);
  const lightboxTouchStartX = useRef<number | null>(null);

  const carouselIndex = carousel.index;
  const carouselDirection = carousel.direction;
  const carouselOutgoingIndex = carousel.outgoingIndex;

  useEffect(() => {
    let active = true;
    const loadedUrls: string[] = [];
    setUrls({});
    setFailed(new Set());
    setCarousel(INITIAL_CAROUSEL_STATE);

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
    setCarousel({
      index: Math.max(0, items.length - 1),
      outgoingIndex: null,
      direction: null,
    });
  }, [carouselIndex, items.length]);

  const lightboxOpen = activeIndex !== null;

  useEffect(() => {
    if (!lightboxOpen) return;
    closeButton.current?.focus({ preventScroll: true });
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;

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
  }, [lightboxOpen, items.length]);

  if (items.length === 0) return null;

  function changeCarousel(delta: number) {
    const direction: CarouselDirection = delta < 0 ? 'previous' : 'next';
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setCarousel((current) => {
      const nextIndex = (current.index + delta + items.length) % items.length;
      if (nextIndex === current.index) return current;
      if (reducedMotion) {
        return { index: nextIndex, outgoingIndex: null, direction: null };
      }
      return {
        index: nextIndex,
        outgoingIndex: current.index,
        direction,
      };
    });
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

  function renderCarouselMedia(item: GalleryMediaItem) {
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
    return (
      <span className="media-gallery-carousel-visual">
        <img
          className="media-gallery-carousel-backdrop"
          src={url}
          alt=""
          aria-hidden="true"
        />
        <img
          className="media-gallery-carousel-content media-gallery-thumb-content"
          src={url}
          alt={t('gallery.imageAlt')}
        />
      </span>
    );
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
          <div className="media-gallery-carousel-track">
            {items.map((item, index) => {
              const isActive = index === carouselIndex;
              const isOutgoing =
                carouselDirection !== null &&
                index === carouselOutgoingIndex &&
                index !== carouselIndex;
              const directionClass = carouselDirection
                ? ` is-${carouselDirection}`
                : '';

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`media-gallery-carousel-slide${
                    isActive ? ` is-active${directionClass}` : ''
                  }${isOutgoing ? ` is-outgoing${directionClass}` : ''}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveIndex(index)}
                  onAnimationEnd={(event) => {
                    if (!isOutgoing || event.target !== event.currentTarget) {
                      return;
                    }
                    setCarousel((current) =>
                      current.outgoingIndex === index
                        ? { ...current, outgoingIndex: null, direction: null }
                        : current,
                    );
                  }}
                  aria-label={t('gallery.openItem', {
                    index: index + 1,
                    count: items.length,
                  })}
                >
                  {renderCarouselMedia(item)}
                </button>
              );
            })}
          </div>

          {items.length > 1 ? (
            <>
              <span
                className="media-gallery-carousel-counter"
                aria-live="polite"
              >
                {t('gallery.counter', {
                  index: carouselIndex + 1,
                  count: items.length,
                })}
              </span>
              <button
                type="button"
                className="media-gallery-carousel-nav media-gallery-carousel-prev"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => changeCarousel(-1)}
                aria-label={t('gallery.previous')}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                className="media-gallery-carousel-nav media-gallery-carousel-next"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => changeCarousel(1)}
                aria-label={t('gallery.next')}
              >
                <span aria-hidden="true">›</span>
              </button>
            </>
          ) : null}
        </div>
      </section>

      {activeItem && activeIndex !== null && typeof document !== 'undefined'
        ? createPortal(
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
                <div className="media-lightbox-stage">
                  {renderMedia(activeItem, 'media-lightbox-content')}

                  {items.length > 1 ? (
                    <span className="media-lightbox-counter" aria-live="polite">
                      {t('gallery.counter', {
                        index: activeIndex + 1,
                        count: items.length,
                      })}
                    </span>
                  ) : null}

                  <button
                    ref={closeButton}
                    type="button"
                    className="media-lightbox-close"
                    onClick={() => setActiveIndex(null)}
                    aria-label={t('gallery.close')}
                  >
                    <span aria-hidden="true">×</span>
                  </button>

                  {items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="media-lightbox-nav media-lightbox-prev"
                        onClick={() => changeActive(-1)}
                        aria-label={t('gallery.previous')}
                      >
                        <span aria-hidden="true">‹</span>
                      </button>
                      <button
                        type="button"
                        className="media-lightbox-nav media-lightbox-next"
                        onClick={() => changeActive(1)}
                        aria-label={t('gallery.next')}
                      >
                        <span aria-hidden="true">›</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
