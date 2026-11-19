import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { Link } from 'react-router-dom';
import type { MemoryMapEntry } from '../api/generated/models/MemoryMapEntry';
import { memoryDetailPath } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

/** A finite collection of source memories, not a looping media/lightbox gallery. */
export function MemoryMapMemories({
  placeName,
  items,
  activeMemoryId,
  initialMemoryId,
  onSelect,
  onOpen,
  onReset,
  preview,
  formatDate,
  reveal,
}: {
  placeName: string;
  items: readonly MemoryMapEntry[];
  activeMemoryId?: string;
  initialMemoryId?: string;
  onSelect: (memoryId: string) => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, entry: MemoryMapEntry) => void;
  onReset: () => void;
  preview: (entry: MemoryMapEntry) => ReactNode;
  formatDate: (entry: MemoryMapEntry) => string;
  reveal: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const track = useRef<HTMLUListElement>(null);
  const initialized = useRef(false);
  const initialId = useRef(initialMemoryId);
  const scrollFrame = useRef<number | null>(null);
  const requestedIndex = useRef<number | null>(null);
  const activeIndex = Math.max(
    0,
    items.findIndex((entry) => entry.memoryId === activeMemoryId),
  );
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const centerSlide = useCallback((index: number, behavior: ScrollBehavior) => {
    const element = track.current;
    const slide = element?.children[index];
    if (!element || !(slide instanceof HTMLElement)) return;
    const viewport = element.getBoundingClientRect();
    const bounds = slide.getBoundingClientRect();
    const delta =
      (bounds.left + bounds.right - viewport.left - viewport.right) / 2;
    if (Math.abs(delta) < 1) {
      requestedIndex.current = null;
      return;
    }
    // A definite destination allows rapid button presses to supersede an
    // in-flight scroll instead of stopping at an intermediate snap point.
    element.scrollTo({ left: element.scrollLeft + delta, behavior });
  }, []);

  useLayoutEffect(() => {
    const element = track.current;
    if (!element || initialized.current) return;
    const wanted = initialId.current;
    const index = wanted
      ? items.findIndex((entry) => entry.memoryId === wanted)
      : 0;
    // A restored source may arrive on a later authorized projection page.
    if (index < 0) return;
    const initialize = () => {
      if (!element.clientWidth || initialized.current) return;
      initialized.current = true;
      centerSlide(index, 'instant');
    };
    initialize();
    if (initialized.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      initialize();
      if (initialized.current) observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [items, centerSlide]);

  useEffect(
    () => () => {
      if (scrollFrame.current !== null)
        window.cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function readSelection() {
    const element = track.current;
    if (!element?.clientWidth) return;
    const viewport = element.getBoundingClientRect();
    const center = (viewport.left + viewport.right) / 2;
    const slides = Array.from(element.children);
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    slides.forEach((slide, index) => {
      const bounds = slide.getBoundingClientRect();
      const nextDistance = Math.abs((bounds.left + bounds.right) / 2 - center);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = index;
      }
    });
    if (requestedIndex.current !== null && requestedIndex.current !== nearest)
      return;
    requestedIndex.current = null;
    const entry = items[nearest];
    if (entry && nearest !== activeIndexRef.current)
      selectRef.current(entry.memoryId);
  }

  function scrollChanged() {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = null;
      readSelection();
    });
  }

  function takeScrollOwnership() {
    initialized.current = true;
    requestedIndex.current = null;
  }

  function changeMemory(delta: number) {
    initialized.current = true;
    const next = Math.max(
      0,
      Math.min(
        items.length - 1,
        (requestedIndex.current ?? activeIndex) + delta,
      ),
    );
    requestedIndex.current = next;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    centerSlide(next, reduced ? 'instant' : 'smooth');
    onSelect(items[next].memoryId);
  }

  return (
    <section aria-labelledby={headingId} className="memory-map-selection">
      <div className="memory-map-selection-heading">
        <div className="memory-map-selection-place">
          <h2 id={headingId}>
            <EimirIcon name="orte" />
            {placeName}
          </h2>
          <span>{t('memoryMap.memoryCount', { count: items.length })}</span>
        </div>
        <button
          type="button"
          className="tertiary"
          onClick={onReset}
          aria-label={t('memoryMap.allPlaces')}
          title={t('memoryMap.allPlaces')}
        >
          <EimirIcon name="close" />
        </button>
      </div>
      {items.length > 1 ? (
        <div className="memory-map-strip-controls">
          <button
            type="button"
            className="secondary memory-map-previous"
            aria-label={t('memoryMap.previousMemory')}
            disabled={activeIndex === 0}
            onClick={() => changeMemory(-1)}
          >
            <EimirIcon name="chevron-right" />
          </button>
          <span role="status" aria-live="polite" aria-atomic="true">
            {t('memoryMap.position', {
              position: activeIndex + 1,
              count: items.length,
            })}
          </span>
          <button
            type="button"
            className="secondary memory-map-next"
            aria-label={t('memoryMap.nextMemory')}
            disabled={activeIndex === items.length - 1}
            onClick={() => changeMemory(1)}
          >
            <EimirIcon name="chevron-right" />
          </button>
        </div>
      ) : null}
      <ul
        ref={track}
        className={`memory-map-strip${reveal ? ' eimir-motion-disclosure' : ''}`}
        aria-label={t('memoryMap.memoriesAtPlace', { name: placeName })}
        onScroll={scrollChanged}
        onScrollEnd={readSelection}
        onPointerDown={takeScrollOwnership}
        onWheel={takeScrollOwnership}
        onKeyDown={takeScrollOwnership}
      >
        {items.map((entry) => (
          <li key={entry.memoryId}>
            <Link
              className={`memory-map-memory${entry.previewAttachmentId ? ' has-photo' : ''}`}
              to={memoryDetailPath(entry.memoryId)}
              data-task-item-key={`map-memory:${entry.memoryId}`}
              aria-current={
                entry.memoryId === items[activeIndex]?.memoryId
                  ? 'true'
                  : undefined
              }
              onClick={(event) => onOpen(event, entry)}
              onFocus={() => {
                takeScrollOwnership();
                onSelect(entry.memoryId);
              }}
            >
              {entry.previewAttachmentId ? (
                <span className="memory-map-thumbnail" aria-hidden="true">
                  {preview(entry)}
                </span>
              ) : (
                <EimirIcon name="erinnerungen" />
              )}
              <span className="memory-map-memory-copy">
                <strong>{entry.title || t('memoryMap.untitled')}</strong>
                <time dateTime={entry.happenedOn.toISOString().slice(0, 10)}>
                  {formatDate(entry)}
                </time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MemoryMapPhotoStack({
  entries,
  activeMemoryId,
  expanded,
  preview,
}: {
  entries: readonly MemoryMapEntry[];
  activeMemoryId?: string;
  expanded: boolean;
  preview: (entry: MemoryMapEntry) => ReactNode;
}) {
  const active =
    entries.find((entry) => entry.memoryId === activeMemoryId) ??
    entries.find((entry) => entry.previewAttachmentId) ??
    entries[0];
  const remaining = entries.filter((entry) => entry !== active);
  const visible = [
    active,
    ...remaining.filter((entry) => entry.previewAttachmentId),
    ...remaining.filter((entry) => !entry.previewAttachmentId),
  ]
    .filter(Boolean)
    .slice(0, 3);
  return (
    <span
      className="memory-map-photo-stack"
      data-expanded={expanded}
      data-active-memory={active?.memoryId}
      aria-hidden="true"
    >
      {visible.map((entry, index) => (
        <span
          className="memory-map-stack-photo"
          data-slot={index}
          key={entry.memoryId}
        >
          {preview(entry)}
        </span>
      ))}
    </span>
  );
}
