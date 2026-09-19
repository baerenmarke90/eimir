import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
  const carouselTrack = useRef<HTMLDivElement | null>(null);
  const carouselSlides = useRef<Array<HTMLButtonElement | null>>([]);
  const carouselScrollFrame = useRef<number | null>(null);
  const carouselScrollEndTimer = useRef<number | null>(null);
  const lightboxTrack = useRef<HTMLDivElement | null>(null);
  const lightboxSlides = useRef<Array<HTMLDivElement | null>>([]);
  const lightboxScrollFrame = useRef<number | null>(null);
  const lightboxScrollEndTimer = useRef<number | null>(null);
  const lightboxInitialIndex = useRef(0);
  const activeIndexRef = useRef<number | null>(null);

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

  useLayoutEffect(() => {
    const track = carouselTrack.current;
    const firstSlide = carouselSlides.current[0];
    if (!track || !firstSlide || items.length < 2) return;
    track.scrollLeft = firstSlide.offsetLeft;
  }, [items]);

  useEffect(
    () => () => {
      if (carouselScrollFrame.current !== null) {
        window.cancelAnimationFrame(carouselScrollFrame.current);
      }
      if (carouselScrollEndTimer.current !== null) {
        window.clearTimeout(carouselScrollEndTimer.current);
      }
      if (lightboxScrollFrame.current !== null) {
        window.cancelAnimationFrame(lightboxScrollFrame.current);
      }
      if (lightboxScrollEndTimer.current !== null) {
        window.clearTimeout(lightboxScrollEndTimer.current);
      }
    },
    [],
  );

  const lightboxOpen = activeIndex !== null;

  useLayoutEffect(() => {
    if (!lightboxOpen || items.length < 2) return;
    const track = lightboxTrack.current;
    const slide = lightboxSlides.current[lightboxInitialIndex.current];
    if (!track || !slide) return;
    track.scrollLeft = slide.offsetLeft;
  }, [lightboxOpen, items.length]);

  const changeActive = useCallback(
    (delta: number) => {
      const current = activeIndexRef.current;
      if (current === null || items.length < 2) return;

      const direction = delta < 0 ? -1 : 1;
      const nextIndex = (current + direction + items.length) % items.length;
      const track = lightboxTrack.current;
      if (!track) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        return;
      }

      const reducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let target: HTMLElement | null =
        lightboxSlides.current[nextIndex] ?? null;
      if (!reducedMotion && direction < 0 && current === 0) {
        target = track.querySelector<HTMLElement>(
          '[data-lightbox-clone="start"]',
        );
      } else if (
        !reducedMotion &&
        direction > 0 &&
        current === items.length - 1
      ) {
        target = track.querySelector<HTMLElement>(
          '[data-lightbox-clone="end"]',
        );
      }

      if (!target) return;

      if (reducedMotion) {
        track.scrollLeft = target.offsetLeft;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        return;
      }

      track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    },
    [items.length],
  );

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
      if (event.key === 'Escape') {
        activeIndexRef.current = null;
        setActiveIndex(null);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        changeActive(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        changeActive(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeActive, lightboxOpen]);

  if (items.length === 0) return null;

  function nearestCarouselSlide(track: HTMLDivElement): HTMLElement | null {
    const slides = Array.from(
      track.querySelectorAll<HTMLElement>('[data-carousel-index]'),
    );
    if (slides.length === 0) return null;

    return slides.reduce((nearest, slide) =>
      Math.abs(slide.offsetLeft - track.scrollLeft) <
      Math.abs(nearest.offsetLeft - track.scrollLeft)
        ? slide
        : nearest,
    );
  }

  function finishCarouselScroll(track: HTMLDivElement) {
    const nearest = nearestCarouselSlide(track);
    if (!nearest) return;

    const index = Number(nearest.dataset.carouselIndex);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return;

    setCarouselIndex(index);

    if (nearest.dataset.carouselClone) {
      const realSlide = carouselSlides.current[index];
      if (realSlide) {
        track.scrollLeft = realSlide.offsetLeft;
      }
    }
  }

  function handleCarouselScroll(track: HTMLDivElement) {
    if (carouselScrollFrame.current === null) {
      carouselScrollFrame.current = window.requestAnimationFrame(() => {
        carouselScrollFrame.current = null;
        const nearest = nearestCarouselSlide(track);
        if (!nearest) return;
        const index = Number(nearest.dataset.carouselIndex);
        if (Number.isInteger(index) && index >= 0 && index < items.length) {
          setCarouselIndex(index);
        }
      });
    }

    if (carouselScrollEndTimer.current !== null) {
      window.clearTimeout(carouselScrollEndTimer.current);
    }
    carouselScrollEndTimer.current = window.setTimeout(() => {
      carouselScrollEndTimer.current = null;
      finishCarouselScroll(track);
    }, 100);
  }

  function changeCarousel(delta: number) {
    if (items.length < 2) return;

    const direction = delta < 0 ? -1 : 1;
    const nextIndex = (carouselIndex + direction + items.length) % items.length;
    const track = carouselTrack.current;
    if (!track) {
      setCarouselIndex(nextIndex);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      const realSlide = carouselSlides.current[nextIndex];
      if (realSlide) {
        track.scrollLeft = realSlide.offsetLeft;
      }
      setCarouselIndex(nextIndex);
      return;
    }

    let target: HTMLElement | null = carouselSlides.current[nextIndex] ?? null;
    if (direction < 0 && carouselIndex === 0) {
      target = track.querySelector<HTMLElement>(
        '[data-carousel-clone="start"]',
      );
    } else if (direction > 0 && carouselIndex === items.length - 1) {
      target = track.querySelector<HTMLElement>('[data-carousel-clone="end"]');
    }

    if (!target) return;
    track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  }

  function nearestLightboxSlide(track: HTMLDivElement): HTMLElement | null {
    const slides = Array.from(
      track.querySelectorAll<HTMLElement>('[data-lightbox-index]'),
    );
    if (slides.length === 0) return null;

    return slides.reduce((nearest, slide) =>
      Math.abs(slide.offsetLeft - track.scrollLeft) <
      Math.abs(nearest.offsetLeft - track.scrollLeft)
        ? slide
        : nearest,
    );
  }

  function finishLightboxScroll(track: HTMLDivElement) {
    const nearest = nearestLightboxSlide(track);
    if (!nearest) return;

    const index = Number(nearest.dataset.lightboxIndex);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return;

    activeIndexRef.current = index;
    setActiveIndex(index);

    if (nearest.dataset.lightboxClone) {
      const realSlide = lightboxSlides.current[index];
      if (realSlide) {
        track.scrollLeft = realSlide.offsetLeft;
      }
    }
  }

  function handleLightboxScroll(track: HTMLDivElement) {
    if (lightboxScrollFrame.current === null) {
      lightboxScrollFrame.current = window.requestAnimationFrame(() => {
        lightboxScrollFrame.current = null;
        const nearest = nearestLightboxSlide(track);
        if (!nearest) return;
        const index = Number(nearest.dataset.lightboxIndex);
        if (Number.isInteger(index) && index >= 0 && index < items.length) {
          activeIndexRef.current = index;
          setActiveIndex(index);
        }
      });
    }

    if (lightboxScrollEndTimer.current !== null) {
      window.clearTimeout(lightboxScrollEndTimer.current);
    }
    lightboxScrollEndTimer.current = window.setTimeout(() => {
      lightboxScrollEndTimer.current = null;
      finishLightboxScroll(track);
    }, 100);
  }

  function openLightbox(index: number) {
    lightboxInitialIndex.current = index;
    activeIndexRef.current = index;
    setActiveIndex(index);
  }

  function closeLightbox() {
    activeIndexRef.current = null;
    setActiveIndex(null);
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
        <div className="media-gallery-carousel-viewport">
          <div
            ref={carouselTrack}
            className="media-gallery-carousel-track"
            onScroll={(event) => handleCarouselScroll(event.currentTarget)}
          >
            {items.length > 1 ? (
              <div
                className="media-gallery-carousel-slide is-clone"
                data-carousel-index={items.length - 1}
                data-carousel-clone="start"
                aria-hidden="true"
              >
                {renderCarouselMedia(items[items.length - 1]!)}
              </div>
            ) : null}

            {items.map((item, index) => {
              const isActive = index === carouselIndex;

              return (
                <button
                  ref={(element) => {
                    carouselSlides.current[index] = element;
                  }}
                  key={item.id}
                  type="button"
                  className={`media-gallery-carousel-slide${
                    isActive ? ' is-active' : ''
                  }`}
                  data-carousel-index={index}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => openLightbox(index)}
                  aria-label={t('gallery.openItem', {
                    index: index + 1,
                    count: items.length,
                  })}
                >
                  {renderCarouselMedia(item)}
                </button>
              );
            })}

            {items.length > 1 ? (
              <div
                className="media-gallery-carousel-slide is-clone"
                data-carousel-index={0}
                data-carousel-clone="end"
                aria-hidden="true"
              >
                {renderCarouselMedia(items[0]!)}
              </div>
            ) : null}
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
            >
              <div className="media-lightbox">
                <div className="media-lightbox-stage">
                  {items.length > 1 ? (
                    <div
                      ref={lightboxTrack}
                      className="media-lightbox-track"
                      onScroll={(event) =>
                        handleLightboxScroll(event.currentTarget)
                      }
                    >
                      <div
                        className="media-lightbox-slide is-clone"
                        data-lightbox-index={items.length - 1}
                        data-lightbox-clone="start"
                        aria-hidden="true"
                      >
                        {renderMedia(
                          items[items.length - 1]!,
                          'media-lightbox-content',
                        )}
                      </div>

                      {items.map((item, index) => (
                        <div
                          ref={(element) => {
                            lightboxSlides.current[index] = element;
                          }}
                          key={item.id}
                          className="media-lightbox-slide"
                          data-lightbox-index={index}
                          aria-hidden={index !== activeIndex}
                        >
                          {renderMedia(item, 'media-lightbox-content')}
                        </div>
                      ))}

                      <div
                        className="media-lightbox-slide is-clone"
                        data-lightbox-index={0}
                        data-lightbox-clone="end"
                        aria-hidden="true"
                      >
                        {renderMedia(items[0]!, 'media-lightbox-content')}
                      </div>
                    </div>
                  ) : (
                    renderMedia(activeItem, 'media-lightbox-content')
                  )}

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
                    onClick={closeLightbox}
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
