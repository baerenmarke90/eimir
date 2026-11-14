import {
  type ReactNode,
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
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useObjectUrlResources } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MediaProcessingState } from './MediaProcessingState';
import {
  SensitiveMediaControl,
  SensitiveMediaCover,
  useSensitiveMediaReveals,
} from './SensitiveMedia';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import { VideoPlayer, type VideoSourceLoader } from './VideoPlayer';
import { VideoTransferFeedback } from './VideoTransferFeedback';
import { VoiceNotePlayer, VoiceNotePreview } from './VoiceNotePlayer';
import { ZoomablePhoto } from './ZoomablePhoto';
import './MediaGallery.css';

function cancelScrollFeedback(
  frame: { current: number | null },
  timer: { current: number | null },
) {
  if (frame.current !== null) {
    window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

function observeTrackResize(track: HTMLDivElement, onResize: () => void) {
  let width = track.clientWidth;
  let height = track.clientHeight;
  const observer = new ResizeObserver(() => {
    const nextWidth = track.clientWidth;
    const nextHeight = track.clientHeight;
    // Initial delivery and re-observation are not geometry changes. In
    // particular, they must not interrupt an in-flight native animation.
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    onResize();
  });
  observer.observe(track);
  return () => observer.disconnect();
}

function nearestSnapSlide(
  track: HTMLDivElement,
  attribute: 'data-carousel-index' | 'data-lightbox-index',
): HTMLElement | null {
  const slides = Array.from(
    track.querySelectorAll<HTMLElement>(`[${attribute}]`),
  );
  if (slides.length === 0) return null;
  return slides.reduce((nearest, slide) =>
    Math.abs(slide.offsetLeft - track.scrollLeft) <
    Math.abs(nearest.offsetLeft - track.scrollLeft)
      ? slide
      : nearest,
  );
}

function updatePositionIndicator(
  position: HTMLElement | null,
  track: HTMLDivElement,
  slide: HTMLElement,
) {
  if (!position) return;
  const current = position.children[Number(slide.dataset.carouselIndex)];
  if (!(current instanceof HTMLButtonElement) || !current.offsetWidth) return;
  const [marker, wrapMarker] = position.querySelectorAll<HTMLElement>(
    '.media-gallery-position-marker',
  );
  if (!marker || !wrapMarker) return;

  const offset = track.scrollLeft - slide.offsetLeft;
  const adjacent =
    offset < 0 ? slide.previousElementSibling : slide.nextElementSibling;
  const neighbor = adjacent instanceof HTMLElement ? adjacent : null;
  const next = position.children[Number(neighbor?.dataset.carouselIndex)];
  const distance = neighbor ? neighbor.offsetLeft - slide.offsetLeft : 0;
  const progress = distance ? Math.max(0, Math.min(1, offset / distance)) : 0;
  const target = next instanceof HTMLButtonElement ? next : current;
  const x = current.offsetLeft + current.offsetWidth / 2;
  const y = current.offsetTop + current.offsetHeight / 2;
  const targetX = target.offsetLeft + target.offsetWidth / 2;
  const targetY = target.offsetTop + target.offsetHeight / 2;
  // Fade between the endpoints of a circular swipe or a wrapped row.
  const crossesEdge =
    y !== targetY ||
    slide.dataset.carouselClone ||
    neighbor?.dataset.carouselClone;

  marker.style.transform = `translate(${crossesEdge ? x : x + (targetX - x) * progress}px, ${y}px) translate(-50%, -50%)`;
  marker.style.opacity = String(crossesEdge ? 1 - progress : 1);
  wrapMarker.style.transform = `translate(${targetX}px, ${targetY}px) translate(-50%, -50%)`;
  wrapMarker.style.opacity = String(crossesEdge ? progress : 0);
  if (!position.dataset.tracking) position.dataset.tracking = 'true';
}

export function GalleryExpandAction({
  onOpen,
  className = '',
}: {
  onOpen: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`media-gallery-expand media-overlay ${className}`}
      onClick={onOpen}
      aria-label={t('photoReactions.fullscreen')}
    >
      <EimirIcon name="expand" />
    </button>
  );
}

/** How long the carousel's controls stay hidden after the last swipe. */
const CONTROLS_REST_MS = 1500;
const CONTROLS_HIDDEN_CLASS = 'is-browsing';

export interface GalleryMediaItem {
  status?: string;
  id: string;
  mediaType: MediaTypeValue;
  isSensitive?: boolean;
  durationSeconds?: number | null;
  hasThumbnail?: boolean;
}

export function MediaGallery({
  items,
  initialMediaId,
  loadMedia,
  loadPoster,
  loadPlayback,
  resourceScopeKey = 'gallery',
  renderPreviews,
  renderCaption,
  dismissWithHistory = true,
  directSensitiveToggle = false,
  showInlineSensitiveControl = true,
  readingFrame = false,
  presentation = 'default',
  countStyle = presentation === 'composer' ? 'fraction' : 'label',
  onPhotoLongPress,
  renderPhotoActions,
  renderPhotoReactions,
  onSettledMediaChange,
}: {
  items: GalleryMediaItem[];
  initialMediaId?: string;
  loadMedia: (
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
  loadPoster?: (
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
  loadPlayback?: VideoSourceLoader;
  resourceScopeKey?: string;
  /** Custom thumbnail surface; originals are then loaded only for the active photo and neighbours. */
  renderPreviews?: (open: (index: number) => void) => ReactNode;
  renderCaption?: (
    index: number,
    close: (afterClose?: () => void) => void,
  ) => ReactNode;
  dismissWithHistory?: boolean;
  directSensitiveToggle?: boolean;
  /** Fullscreen reveal/hide remains available independently of the gallery control. */
  showInlineSensitiveControl?: boolean;
  readingFrame?: boolean;
  presentation?: 'default' | 'composer';
  countStyle?: 'fraction' | 'label';
  onPhotoLongPress?: (id: string) => void;
  renderPhotoActions?: (
    item: GalleryMediaItem,
    openFullScreen: () => void,
    revealed: boolean,
  ) => ReactNode;
  /** Overlay the active slide without adding height to the reader. */
  renderPhotoReactions?: (item: GalleryMediaItem) => ReactNode;
  /** Editor thumbnails follow completed native swipes without taking gesture ownership. */
  onSettledMediaChange?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const itemIdentity = JSON.stringify(
    items.map((item) => [item.id, item.mediaType]),
  );
  const reveals = useSensitiveMediaReveals(
    JSON.stringify([
      resourceScopeKey,
      items.map((item) => [item.id, item.isSensitive]),
    ]),
  );
  const startingIndex = Math.max(
    0,
    items.findIndex((item) => item.id === initialMediaId),
  );
  const [carouselIndex, setCarouselIndex] = useState(startingIndex);
  const showCarouselPosition =
    !renderPreviews && presentation === 'composer' && items.length > 1;
  const photoPress = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
    suppressClick: boolean;
    pressed: boolean;
  }>({ x: 0, y: 0, suppressClick: false, pressed: false });
  const cancelPhotoPress = useCallback((suppressClick = false) => {
    clearTimeout(photoPress.current.timer);
    photoPress.current.timer = undefined;
    photoPress.current.pressed = false;
    if (suppressClick) photoPress.current.suppressClick = true;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Cancel a pending gesture when its authorized media identity changes.
  useEffect(
    () => () => cancelPhotoPress(),
    [resourceScopeKey, itemIdentity, cancelPhotoPress],
  );
  // Scroll frames preview a swipe; only a selection or completed swipe owns
  // resize alignment. A layout change must not commit an intermediate slide.
  const carouselIndexRef = useRef(startingIndex);
  const carouselScrollTarget = useRef<number | null>(startingIndex);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const resourceFocusIndex =
    activeIndex ?? (renderPreviews ? null : carouselIndex);
  const mediaResourceIds = items
    .filter((item, index) => {
      if (
        item.mediaType === MediaType.VIDEO ||
        (item.status && item.status !== 'READY')
      )
        return false;
      if (item.mediaType === MediaType.AUDIO)
        return (
          index === activeIndex &&
          (item.isSensitive === false || reveals.isRevealed(item.id))
        );
      if (resourceFocusIndex === null) return false;
      return [
        resourceFocusIndex,
        (resourceFocusIndex + 1) % items.length,
        (resourceFocusIndex - 1 + items.length) % items.length,
      ].includes(index);
    })
    .map((item) => item.id);
  const mediaResources = useObjectUrlResources(
    resourceScopeKey,
    mediaResourceIds,
    (attachmentId, signal) => loadMedia(attachmentId, signal),
  );
  const urls = mediaResources.urls;
  const posterIds =
    loadPoster && resourceFocusIndex !== null
      ? items
          .filter(
            (item, index) =>
              item.mediaType === MediaType.VIDEO &&
              (!item.status || item.status === 'READY') &&
              (!item.isSensitive || reveals.isRevealed(item.id)) &&
              item.hasThumbnail !== false &&
              [
                resourceFocusIndex,
                (resourceFocusIndex + 1) % items.length,
                (resourceFocusIndex - 1 + items.length) % items.length,
              ].includes(index),
          )
          .map((item) => item.id)
      : [];
  const posters = useObjectUrlResources(
    `video-posters:${resourceScopeKey}`,
    posterIds,
    (id, signal) => loadPoster!(id, signal),
  );
  const failed = new Set(Object.keys(mediaResources.errors));
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const lightboxDialog = useRef<HTMLDivElement | null>(null);
  const carouselTrack = useRef<HTMLDivElement | null>(null);
  const carouselPosition = useRef<HTMLElement | null>(null);
  const carouselSlides = useRef<Array<HTMLButtonElement | null>>([]);
  const carouselScrollFrame = useRef<number | null>(null);
  const carouselScrollEndTimer = useRef<number | null>(null);
  const carouselViewport = useRef<HTMLDivElement | null>(null);
  const controlsRestTimer = useRef<number | null>(null);
  const userBrowsing = useRef(false);
  const lightboxTrack = useRef<HTMLDivElement | null>(null);
  const lightboxSlides = useRef<Array<HTMLDivElement | null>>([]);
  const lightboxScrollFrame = useRef<number | null>(null);
  const lightboxScrollEndTimer = useRef<number | null>(null);
  const lightboxInitialIndex = useRef(0);
  const lightboxScrollTarget = useRef<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const carouselItemsIdentityRef = useRef<{
    items: string;
    mediaId?: string;
  } | null>(null);
  const activeItemIdRef = useRef<string | null>(null);
  const cancelCarouselFeedback = useCallback(() => {
    cancelScrollFeedback(carouselScrollFrame, carouselScrollEndTimer);
  }, []);
  const cancelLightboxFeedback = useCallback(() => {
    cancelScrollFeedback(lightboxScrollFrame, lightboxScrollEndTimer);
  }, []);
  /**
   * Overlaid controls get out of the way while the viewer swipes through the
   * photos and return once the gesture has rested. Only the viewer's own
   * gestures count, not layout or programmatic scrolling.
   */
  const holdBrowsing = useCallback((hideControls: boolean) => {
    userBrowsing.current = true;
    // The draft stage's edit controls stay put; reading galleries step aside.
    const viewport = carouselViewport.current;
    if (hideControls && viewport && !viewport.closest('.photo-draft-stage'))
      viewport.classList.add(CONTROLS_HIDDEN_CLASS);
    if (controlsRestTimer.current !== null)
      window.clearTimeout(controlsRestTimer.current);
    controlsRestTimer.current = window.setTimeout(() => {
      controlsRestTimer.current = null;
      userBrowsing.current = false;
      carouselViewport.current?.classList.remove(CONTROLS_HIDDEN_CLASS);
    }, CONTROLS_REST_MS);
  }, []);
  useEffect(
    () => () => {
      if (controlsRestTimer.current !== null)
        window.clearTimeout(controlsRestTimer.current);
    },
    [],
  );
  const dismiss = useCallback(() => {
    cancelLightboxFeedback();
    lightboxScrollTarget.current = null;
    activeIndexRef.current = null;
    setActiveIndex(null);
  }, [cancelLightboxFeedback]);
  const closeHistoryEntry = useEditorHistoryEntry({
    isActive: dismissWithHistory && activeIndex !== null,
    isDirty: false,
    onDiscardRequested: dismiss,
    onClose: dismiss,
  });
  const closeLightbox = useCallback(
    (afterClose?: unknown) => {
      const complete = () => {
        dismiss();
        if (typeof afterClose === 'function') afterClose();
      };
      if (dismissWithHistory) closeHistoryEntry(complete);
      else complete();
    },
    [dismiss, dismissWithHistory, closeHistoryEntry],
  );

  // Removal/reordering cannot silently show a different parent at the old index.
  useLayoutEffect(() => {
    if (
      activeIndex !== null &&
      activeItemIdRef.current !== items[activeIndex]?.id
    )
      closeLightbox();
  }, [items, activeIndex, closeLightbox]);

  useEffect(() => {
    if (carouselIndex < items.length) return;
    setCarouselIndex(Math.max(0, items.length - 1));
  }, [carouselIndex, items.length]);

  useLayoutEffect(() => {
    const previous = carouselItemsIdentityRef.current;
    if (previous?.items === itemIdentity && previous.mediaId === initialMediaId)
      return;
    carouselItemsIdentityRef.current = {
      items: itemIdentity,
      mediaId: initialMediaId,
    };
    // A parent acknowledging a native swipe is not a new scroll command.
    if (
      previous?.items === itemIdentity &&
      carouselScrollTarget.current === null &&
      carouselIndexRef.current === startingIndex
    )
      return;
    // A new explicit selection owns subsequent feedback and resize alignment.
    cancelCarouselFeedback();
    carouselIndexRef.current = startingIndex;
    carouselScrollTarget.current = startingIndex;
    setCarouselIndex(startingIndex);

    const track = carouselTrack.current;
    const firstSlide = carouselSlides.current[startingIndex];
    if (!track || !firstSlide || items.length < 2) return;
    track.scrollLeft = firstSlide.offsetLeft;
    updatePositionIndicator(carouselPosition.current, track, firstSlide);
  }, [
    itemIdentity,
    items.length,
    initialMediaId,
    startingIndex,
    cancelCarouselFeedback,
  ]);

  useLayoutEffect(() => {
    const track = carouselTrack.current;
    if (!track || items.length < 2 || typeof ResizeObserver === 'undefined')
      return;
    return observeTrackResize(track, () => {
      const slide = carouselSlides.current[carouselIndexRef.current];
      if (!slide) return;
      cancelCarouselFeedback();
      carouselScrollTarget.current = carouselIndexRef.current;
      setCarouselIndex(carouselIndexRef.current);
      track.scrollLeft = slide.offsetLeft;
      updatePositionIndicator(carouselPosition.current, track, slide);
    });
  }, [items.length, cancelCarouselFeedback]);

  useLayoutEffect(() => {
    const position = carouselPosition.current;
    const track = carouselTrack.current;
    if (!showCarouselPosition || !position || !track) return;

    const syncPosition = () => {
      const slide = nearestSnapSlide(track, 'data-carousel-index');
      if (slide) updatePositionIndicator(position, track, slide);
    };
    syncPosition();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncPosition);
    observer.observe(position);
    return () => observer.disconnect();
  }, [showCarouselPosition]);

  useEffect(
    () => () => {
      cancelCarouselFeedback();
      cancelLightboxFeedback();
    },
    [cancelCarouselFeedback, cancelLightboxFeedback],
  );

  const lightboxOpen = activeIndex !== null;

  useLayoutEffect(() => {
    if (!lightboxOpen || items.length < 2) return;
    const track = lightboxTrack.current;
    const slide = lightboxSlides.current[lightboxInitialIndex.current];
    if (!track || !slide) return;
    track.scrollLeft = slide.offsetLeft;
  }, [lightboxOpen, items.length]);

  useLayoutEffect(() => {
    const track = lightboxTrack.current;
    if (!lightboxOpen || !track || typeof ResizeObserver === 'undefined')
      return;
    return observeTrackResize(track, () => {
      // Resize owns geometry, not selection. An in-flight keyboard/button
      // advance retains its destination until native scrolling reaches it.
      const current = lightboxScrollTarget.current ?? activeIndexRef.current;
      const slide = current === null ? null : lightboxSlides.current[current];
      if (current === null || !slide) return;
      cancelLightboxFeedback();
      track.scrollLeft = slide.offsetLeft;
      activeIndexRef.current = current;
      activeItemIdRef.current = items[current]?.id ?? null;
      setActiveIndex(current);
    });
  }, [lightboxOpen, items, cancelLightboxFeedback]);

  const changeActive = useCallback(
    (delta: number) => {
      const current = lightboxScrollTarget.current ?? activeIndexRef.current;
      if (current === null || items.length < 2) return;

      const direction = delta < 0 ? -1 : 1;
      const nextIndex = (current + direction + items.length) % items.length;
      const track = lightboxTrack.current;
      if (!track) {
        activeIndexRef.current = nextIndex;
        activeItemIdRef.current = items[nextIndex]?.id ?? null;
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
      cancelLightboxFeedback();
      lightboxScrollTarget.current = nextIndex;

      if (reducedMotion) {
        track.scrollLeft = target.offsetLeft;
        activeIndexRef.current = nextIndex;
        activeItemIdRef.current = items[nextIndex]?.id ?? null;
        setActiveIndex(nextIndex);
        return;
      }

      track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    },
    [items, cancelLightboxFeedback],
  );

  useModalLifecycle({
    active: lightboxOpen,
    initialFocusRef: closeButton,
  });

  useEffect(() => {
    if (!lightboxOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        closeLightbox();
      }
      if (
        event.target instanceof HTMLVideoElement ||
        (event.target instanceof HTMLInputElement &&
          event.target.type === 'range')
      )
        return;
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
  }, [changeActive, lightboxOpen, closeLightbox]);

  if (items.length === 0) return null;

  function finishCarouselScroll(track: HTMLDivElement) {
    const nearest = nearestSnapSlide(track, 'data-carousel-index');
    if (!nearest) return;

    const index = Number(nearest.dataset.carouselIndex);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return;

    // Passive native resnapping after layout changes cannot replace an explicit
    // selection. A horizontal input hands selection back to the native swipe.
    const requested = carouselScrollTarget.current;
    if (requested !== null && index !== requested) {
      const slide = carouselSlides.current[requested];
      if (slide) track.scrollLeft = slide.offsetLeft;
      return;
    }
    carouselIndexRef.current = index;
    setCarouselIndex(index);
    if (items[index]) onSettledMediaChange?.(items[index].id);

    if (nearest.dataset.carouselClone) {
      const realSlide = carouselSlides.current[index];
      if (realSlide) {
        track.scrollLeft = realSlide.offsetLeft;
      }
    }
  }

  function handleCarouselScroll(track: HTMLDivElement) {
    cancelPhotoPress(true);
    if (userBrowsing.current) holdBrowsing(true);
    if (carouselScrollFrame.current === null) {
      carouselScrollFrame.current = window.requestAnimationFrame(() => {
        carouselScrollFrame.current = null;
        const nearest = nearestSnapSlide(track, 'data-carousel-index');
        if (!nearest) return;
        updatePositionIndicator(carouselPosition.current, track, nearest);
        const index = Number(nearest.dataset.carouselIndex);
        if (Number.isInteger(index) && index >= 0 && index < items.length) {
          if (
            carouselScrollTarget.current !== null &&
            carouselScrollTarget.current !== index
          )
            return;
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
    if (items.length < 2 || delta === 0) return;

    const direction = delta < 0 ? -1 : 1;
    const nextIndex = (carouselIndex + delta + items.length) % items.length;
    carouselIndexRef.current = nextIndex;
    carouselScrollTarget.current = nextIndex;
    const track = carouselTrack.current;
    if (!track) {
      setCarouselIndex(nextIndex);
      if (items[nextIndex]) onSettledMediaChange?.(items[nextIndex].id);
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
      if (items[nextIndex]) onSettledMediaChange?.(items[nextIndex].id);
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

  function finishLightboxScroll(track: HTMLDivElement) {
    if (activeIndexRef.current === null) return;
    const nearest = nearestSnapSlide(track, 'data-lightbox-index');
    if (!nearest) return;

    const index = Number(nearest.dataset.lightboxIndex);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return;

    const requested = lightboxScrollTarget.current;
    if (requested !== null && requested !== index) return;
    lightboxScrollTarget.current = null;
    activeIndexRef.current = index;
    activeItemIdRef.current = items[index]?.id ?? null;
    setActiveIndex(index);
    if (items[index]) onSettledMediaChange?.(items[index].id);

    if (nearest.dataset.lightboxClone) {
      const realSlide = lightboxSlides.current[index];
      if (realSlide) {
        track.scrollLeft = realSlide.offsetLeft;
      }
    }
  }

  function handleLightboxScroll(track: HTMLDivElement) {
    if (activeIndexRef.current === null) return;
    if (lightboxScrollFrame.current === null) {
      lightboxScrollFrame.current = window.requestAnimationFrame(() => {
        lightboxScrollFrame.current = null;
        if (activeIndexRef.current === null) return;
        const nearest = nearestSnapSlide(track, 'data-lightbox-index');
        if (!nearest) return;
        const index = Number(nearest.dataset.lightboxIndex);
        if (Number.isInteger(index) && index >= 0 && index < items.length) {
          if (
            lightboxScrollTarget.current !== null &&
            lightboxScrollTarget.current !== index
          )
            return;
          activeIndexRef.current = index;
          activeItemIdRef.current = items[index]?.id ?? null;
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
    lightboxScrollTarget.current = null;
    activeIndexRef.current = index;
    activeItemIdRef.current = items[index]?.id ?? null;
    setActiveIndex(index);
  }

  function videoPoster(item: GalleryMediaItem) {
    if (!loadPlayback)
      return (
        <div className="media-gallery-unavailable">
          {t('media.unavailable')}
        </div>
      );
    const url = posters.urls[item.id];
    if (item.isSensitive !== false && !reveals.isRevealed(item.id))
      return (
        <SensitiveMediaCover>
          {url && item.isSensitive ? <img src={url} alt="" /> : null}
        </SensitiveMediaCover>
      );
    return (
      <span className="video-poster">
        {url ? <img src={url} alt="" /> : null}
        <span className="video-play-mark" aria-hidden="true">
          <EimirIcon name="play" className="inline-icon" />
        </span>
        {item.durationSeconds != null ? (
          <span className="video-duration media-overlay">
            {Math.floor(item.durationSeconds / 60)}:
            {String(item.durationSeconds % 60).padStart(2, '0')}
          </span>
        ) : null}
      </span>
    );
  }

  function renderMedia(
    item: GalleryMediaItem,
    className: string,
    active = false,
  ) {
    if (item.status && item.status !== 'READY')
      return (
        <MediaProcessingState status={item.status} attachmentId={item.id} />
      );
    if (item.mediaType === MediaType.VIDEO) {
      const revealed =
        item.isSensitive === false || reveals.isRevealed(item.id);
      return active && revealed && loadPlayback ? (
        <VideoPlayer
          key={`${resourceScopeKey}:${item.id}`}
          id={item.id}
          scope={resourceScopeKey}
          poster={posters.urls[item.id]}
          load={loadPlayback}
        />
      ) : (
        videoPoster(item)
      );
    }
    if (item.mediaType === MediaType.AUDIO) {
      if (item.isSensitive !== false && !reveals.isRevealed(item.id))
        return <SensitiveMediaCover />;
      if (!active) return <VoiceNotePreview duration={item.durationSeconds} />;
    }
    if (failed.has(item.id)) {
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
    if (item.mediaType === MediaType.AUDIO) {
      return (
        <div className="media-lightbox-voice">
          <VoiceNotePlayer
            key={item.id}
            src={url}
            duration={item.durationSeconds}
          />
        </div>
      );
    }
    if (item.isSensitive !== false && !reveals.isRevealed(item.id))
      return (
        <SensitiveMediaCover>
          {item.isSensitive === true ? <img src={url} alt="" /> : null}
        </SensitiveMediaCover>
      );
    return active ? (
      <ZoomablePhoto
        key={`${resourceScopeKey}:${item.id}`}
        src={url}
        alt={t('gallery.imageAlt')}
      />
    ) : (
      <img className={className} src={url} alt={t('gallery.imageAlt')} />
    );
  }

  function renderCarouselMedia(item: GalleryMediaItem) {
    if (item.status && item.status !== 'READY')
      return (
        <MediaProcessingState status={item.status} attachmentId={item.id} />
      );
    if (item.mediaType === MediaType.VIDEO) return videoPoster(item);
    if (item.mediaType === MediaType.AUDIO)
      return renderMedia(item, 'media-gallery-image');
    if (failed.has(item.id)) {
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
    if (item.isSensitive !== false && !reveals.isRevealed(item.id))
      return (
        <SensitiveMediaCover>
          {item.isSensitive === true ? <img src={url} alt="" /> : null}
        </SensitiveMediaCover>
      );
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
  const carouselItem = items[carouselIndex];
  const carouselRevealed = carouselItem
    ? reveals.isRevealed(carouselItem.id)
    : false;

  return (
    <>
      {renderPreviews ? (
        renderPreviews(openLightbox)
      ) : (
        <section
          className={`media-gallery-carousel${readingFrame ? ' media-gallery-reader' : ''}`}
          aria-label={t('gallery.aria')}
        >
          <div
            ref={carouselViewport}
            className="media-gallery-carousel-viewport"
          >
            <div
              ref={carouselTrack}
              className="eimir-media-snap-track media-gallery-carousel-track"
              onScroll={(event) => handleCarouselScroll(event.currentTarget)}
              onPointerDown={() => {
                carouselScrollTarget.current = null;
                holdBrowsing(false);
              }}
              onWheel={(event) => {
                if (event.deltaX !== 0 || event.shiftKey) {
                  carouselScrollTarget.current = null;
                  holdBrowsing(false);
                }
              }}
            >
              {items.length > 1 ? (
                <div
                  className="eimir-media-snap-item eimir-media-snap-item-center media-gallery-carousel-slide is-clone"
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
                    className={`eimir-media-snap-item eimir-media-snap-item-center media-gallery-carousel-slide${
                      isActive ? ' is-active' : ''
                    }`}
                    data-carousel-index={index}
                    aria-hidden={!isActive}
                    tabIndex={isActive ? 0 : -1}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'ArrowLeft' ||
                        event.key === 'ArrowRight'
                      )
                        carouselScrollTarget.current = null;
                    }}
                    onPointerDown={(event) => {
                      photoPress.current.suppressClick = false;
                      if (
                        !onPhotoLongPress ||
                        event.button !== 0 ||
                        item.mediaType !== MediaType.IMAGE ||
                        !urls[item.id]
                      )
                        return;
                      cancelPhotoPress();
                      photoPress.current = {
                        x: event.clientX,
                        y: event.clientY,
                        suppressClick: false,
                        pressed: true,
                      };
                      photoPress.current.timer = setTimeout(() => {
                        photoPress.current.suppressClick = true;
                        onPhotoLongPress(item.id);
                      }, 450);
                    }}
                    onPointerMove={(event) => {
                      if (!photoPress.current.pressed) return;
                      if (
                        Math.hypot(
                          event.clientX - photoPress.current.x,
                          event.clientY - photoPress.current.y,
                        ) > 10
                      )
                        cancelPhotoPress(true);
                    }}
                    onPointerUp={() => cancelPhotoPress()}
                    onPointerCancel={() => cancelPhotoPress(true)}
                    onPointerLeave={() => cancelPhotoPress()}
                    onContextMenu={(event) => {
                      if (
                        !onPhotoLongPress ||
                        item.mediaType !== MediaType.IMAGE ||
                        !urls[item.id]
                      )
                        return;
                      event.preventDefault();
                      cancelPhotoPress(true);
                      onPhotoLongPress(item.id);
                    }}
                    onClick={(event) => {
                      cancelPhotoPress();
                      if (
                        onPhotoLongPress &&
                        event.detail !== 0 &&
                        photoPress.current.suppressClick
                      ) {
                        photoPress.current.suppressClick = false;
                        return;
                      }
                      if (
                        directSensitiveToggle &&
                        item.isSensitive === true &&
                        !reveals.isRevealed(item.id)
                      )
                        reveals.toggle(item.id);
                      else openLightbox(index);
                    }}
                    aria-label={
                      directSensitiveToggle &&
                      item.isSensitive === true &&
                      !reveals.isRevealed(item.id)
                        ? t('sensitiveMedia.show')
                        : (item.isSensitive !== false &&
                          !reveals.isRevealed(item.id)
                            ? t('sensitiveMedia.label') + '. '
                            : '') +
                          (loadPlayback &&
                          item.mediaType === MediaType.VIDEO &&
                          (!item.status || item.status === 'READY')
                            ? t('video.play')
                            : t('gallery.openItem', {
                                index: index + 1,
                                count: items.length,
                              }))
                    }
                    aria-description={
                      item.mediaType === MediaType.VIDEO
                        ? t('gallery.openItem', {
                            index: index + 1,
                            count: items.length,
                          })
                        : undefined
                    }
                  >
                    {renderCarouselMedia(item)}
                  </button>
                );
              })}

              {items.length > 1 ? (
                <div
                  className="eimir-media-snap-item eimir-media-snap-item-center media-gallery-carousel-slide is-clone"
                  data-carousel-index={0}
                  data-carousel-clone="end"
                  aria-hidden="true"
                >
                  {renderCarouselMedia(items[0]!)}
                </div>
              ) : null}
            </div>

            {presentation === 'composer' && items.length === 1 ? (
              <span className="media-gallery-carousel-counter media-overlay">
                {t(
                  countStyle === 'label'
                    ? 'gallery.counter'
                    : 'gallery.fraction',
                  { index: 1, count: 1 },
                )}
              </span>
            ) : null}
            {items.length > 1 ? (
              <>
                <span
                  className="media-gallery-carousel-counter media-overlay"
                  aria-live="polite"
                >
                  {t(
                    countStyle === 'label'
                      ? 'gallery.counter'
                      : 'gallery.fraction',
                    {
                      index: carouselIndex + 1,
                      count: items.length,
                    },
                  )}
                </span>
                <button
                  type="button"
                  className="media-gallery-carousel-nav media-gallery-carousel-prev media-overlay"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => changeCarousel(-1)}
                  aria-label={t('gallery.previous')}
                >
                  <EimirIcon name="chevron-left" className="inline-icon" />
                </button>
                <button
                  type="button"
                  className="media-gallery-carousel-nav media-gallery-carousel-next media-overlay"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => changeCarousel(1)}
                  aria-label={t('gallery.next')}
                >
                  <EimirIcon name="chevron-right" className="inline-icon" />
                </button>
              </>
            ) : null}
            {carouselItem?.isSensitive === true &&
            carouselItem.mediaType === MediaType.IMAGE &&
            ((showInlineSensitiveControl && !directSensitiveToggle) ||
              carouselRevealed) ? (
              <SensitiveMediaControl
                overlay
                iconOnly
                className="media-gallery-sensitive-control"
                revealed={carouselRevealed}
                onToggle={() => {
                  if (directSensitiveToggle || !showInlineSensitiveControl)
                    carouselSlides.current[carouselIndex]?.focus({
                      preventScroll: true,
                    });
                  reveals.toggle(carouselItem.id);
                }}
              />
            ) : null}
            {carouselItem
              ? renderPhotoActions?.(
                  carouselItem,
                  () => openLightbox(carouselIndex),
                  carouselItem.isSensitive === false || carouselRevealed,
                )
              : null}
            {carouselItem ? renderPhotoReactions?.(carouselItem) : null}
          </div>
          {showInlineSensitiveControl &&
          carouselItem?.isSensitive === true &&
          carouselItem.mediaType === MediaType.VIDEO &&
          (!directSensitiveToggle || carouselRevealed) ? (
            <SensitiveMediaControl
              mediaType={MediaType.VIDEO}
              revealed={carouselRevealed}
              onToggle={() => reveals.toggle(carouselItem.id)}
            />
          ) : null}
          {showCarouselPosition ? (
            <nav
              ref={carouselPosition}
              className="media-gallery-position"
              aria-label={t('gallery.aria')}
            >
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={t('gallery.selectItem', {
                    index: index + 1,
                    count: items.length,
                  })}
                  aria-current={index === carouselIndex ? 'true' : undefined}
                  onClick={() => {
                    carouselScrollTarget.current = null;
                    changeCarousel(index - carouselIndex);
                  }}
                >
                  <span />
                </button>
              ))}
              <span
                className="media-gallery-position-marker"
                aria-hidden="true"
              />
              <span
                className="media-gallery-position-marker"
                aria-hidden="true"
              />
            </nav>
          ) : null}
        </section>
      )}

      {items
        .filter((item) => item.status === 'PENDING')
        .map((item) => (
          <VideoTransferFeedback key={item.id} attachmentId={item.id} />
        ))}
      {activeItem && activeIndex !== null && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={lightboxDialog}
              className="media-lightbox-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label={t('gallery.dialogAria')}
              onKeyDown={(event) => {
                containModalTabFocus(event, lightboxDialog.current);
              }}
            >
              <div
                className={`media-lightbox${renderCaption ? ' media-lightbox-captioned' : ''}`}
              >
                <div
                  className={`media-lightbox-stage${activeItem.mediaType === MediaType.VIDEO ? ' is-video' : ''}`}
                >
                  {items.length > 1 ? (
                    <div
                      ref={lightboxTrack}
                      className="eimir-media-snap-track media-lightbox-track"
                      onPointerDown={() => {
                        lightboxScrollTarget.current = null;
                      }}
                      onWheel={(event) => {
                        if (event.deltaX !== 0 || event.shiftKey)
                          lightboxScrollTarget.current = null;
                      }}
                      onScroll={(event) =>
                        handleLightboxScroll(event.currentTarget)
                      }
                    >
                      <div
                        className="eimir-media-snap-item eimir-media-snap-item-center media-lightbox-slide is-clone"
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
                          className="eimir-media-snap-item eimir-media-snap-item-center media-lightbox-slide"
                          data-lightbox-index={index}
                          aria-hidden={index !== activeIndex}
                        >
                          {renderMedia(
                            item,
                            'media-lightbox-content',
                            index === activeIndex,
                          )}
                        </div>
                      ))}

                      <div
                        className="eimir-media-snap-item eimir-media-snap-item-center media-lightbox-slide is-clone"
                        data-lightbox-index={0}
                        data-lightbox-clone="end"
                        aria-hidden="true"
                      >
                        {renderMedia(items[0]!, 'media-lightbox-content')}
                      </div>
                    </div>
                  ) : (
                    renderMedia(activeItem, 'media-lightbox-content', true)
                  )}

                  {items.length > 1 ? (
                    <span
                      className="media-lightbox-counter media-overlay"
                      aria-live="polite"
                    >
                      {t('gallery.counter', {
                        index: activeIndex + 1,
                        count: items.length,
                      })}
                    </span>
                  ) : null}

                  <div className="media-lightbox-actions">
                    <button
                      ref={closeButton}
                      type="button"
                      className="media-lightbox-close media-overlay"
                      onClick={closeLightbox}
                      aria-label={t('gallery.close')}
                      title={t('gallery.close')}
                    >
                      <EimirIcon name="close" />
                    </button>
                    {activeItem.isSensitive === true ? (
                      <SensitiveMediaControl
                        overlay
                        iconOnly={activeItem.mediaType === MediaType.IMAGE}
                        mediaType={activeItem.mediaType}
                        revealed={reveals.isRevealed(activeItem.id)}
                        onToggle={() => reveals.toggle(activeItem.id)}
                      />
                    ) : null}
                  </div>

                  {items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="media-lightbox-nav media-lightbox-prev media-overlay"
                        onClick={() => changeActive(-1)}
                        aria-label={t('gallery.previous')}
                      >
                        <EimirIcon
                          name="chevron-left"
                          className="inline-icon"
                        />
                      </button>
                      <button
                        type="button"
                        className="media-lightbox-nav media-lightbox-next media-overlay"
                        onClick={() => changeActive(1)}
                        aria-label={t('gallery.next')}
                      >
                        <EimirIcon
                          name="chevron-right"
                          className="inline-icon"
                        />
                      </button>
                    </>
                  ) : null}
                </div>
                {renderCaption ? (
                  <div className="media-lightbox-footer">
                    <div className="media-lightbox-context">
                      {renderCaption(activeIndex, closeLightbox)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
