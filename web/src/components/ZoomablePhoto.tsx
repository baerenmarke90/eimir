import type { PanzoomObject } from '@panzoom/panzoom';
import Panzoom from '@panzoom/panzoom/dist/panzoom.es.js';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

const PAN_KEYS: Partial<Record<string, readonly [number, number]>> = {
  ArrowLeft: [40, 0],
  ArrowRight: [-40, 0],
  ArrowUp: [0, 40],
  ArrowDown: [0, -40],
};

/** Image-local gestures; fit-size swipes still belong to the native carousel. */
export function ZoomablePhoto({ src, alt }: { src: string; alt: string }) {
  const { t } = useTranslation();
  const helpId = useId();
  const image = useRef<HTMLImageElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const zoom = useRef<PanzoomObject | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const photo = image.current;
    const frame = viewport.current;
    if (!src || !photo || !frame) return;
    setScale(1);
    const controller = Panzoom(photo, {
      canvas: true,
      minScale: 1,
      maxScale: 4,
      contain: 'outside',
      panOnlyWhenZoomed: true,
      touchAction: 'pan-x',
      cursor: 'zoom-in',
      handleStartEvent(event) {
        event.stopPropagation();
        if (controller.getScale() > 1) event.preventDefault();
      },
    });
    zoom.current = controller;
    const changed = () => {
      const current = controller.getScale();
      setScale(current);
      controller.setOptions({
        touchAction: current > 1 ? 'none' : 'pan-x',
        cursor: current > 1 ? 'grab' : 'zoom-in',
      });
    };
    const wheel = (event: WheelEvent) => controller.zoomWithWheel(event);
    photo.addEventListener('panzoomchange', changed);
    frame.addEventListener('wheel', wheel, { passive: false });
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => controller.reset({ animate: false }));
    resize?.observe(frame);
    return () => {
      resize?.disconnect();
      photo.removeEventListener('panzoomchange', changed);
      frame.removeEventListener('wheel', wheel);
      controller.destroy();
      controller.resetStyle();
      zoom.current = null;
    };
  }, [src]);

  return (
    <div
      ref={viewport}
      className="media-lightbox-photo"
      data-zoomed={scale > 1}
      data-primary-tab-swipe-block="true"
      data-pull-to-refresh-block="true"
      role="application"
      aria-label={t('gallery.zoomControls')}
      aria-describedby={helpId}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: This image canvas owns keyboard pan/zoom; focus keeps arrow keys from navigating the gallery.
      tabIndex={0}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest('button')) return;
        event.preventDefault();
        const controller = zoom.current;
        if (!controller) return;
        if (controller.getScale() > 1) controller.reset({ animate: false });
        else controller.zoomToPoint(2.5, event, { animate: false });
      }}
      onKeyDown={(event) => {
        const controller = zoom.current;
        if (!controller || event.target !== event.currentTarget) return;
        const movement = PAN_KEYS[event.key];
        if (movement && controller.getScale() > 1) {
          event.preventDefault();
          controller.pan(movement[0], movement[1], { relative: true });
        } else if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          controller.zoomIn({ animate: false });
        } else if (event.key === '-') {
          event.preventDefault();
          controller.zoomOut({ animate: false });
        } else if (event.key === '0') {
          event.preventDefault();
          controller.reset({ animate: false });
        }
      }}
    >
      <span id={helpId} className="sr-only">
        {t('gallery.keyboardHelp')}
      </span>
      <img
        ref={image}
        className="media-lightbox-content"
        src={src}
        alt={alt}
        draggable={false}
      />
      <div className="media-photo-zoom-controls panzoom-exclude">
        <button
          type="button"
          className="media-overlay"
          aria-label={t('gallery.zoomIn')}
          title={t('gallery.zoomIn')}
          disabled={scale >= 4}
          onClick={() => zoom.current?.zoomIn({ animate: false })}
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          type="button"
          className="media-overlay"
          aria-label={t('gallery.zoomOut')}
          title={t('gallery.zoomOut')}
          disabled={scale <= 1}
          onClick={() => zoom.current?.zoomOut({ animate: false })}
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          className="media-overlay"
          aria-label={t('gallery.fit')}
          title={t('gallery.fit')}
          onClick={() => zoom.current?.reset({ animate: false })}
        >
          <EimirIcon name="expand" />
        </button>
      </div>
    </div>
  );
}
