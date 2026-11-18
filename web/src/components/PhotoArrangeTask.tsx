import {
  Accessibility,
  Feedback,
  PointerActivationConstraints,
} from '@dnd-kit/dom';
import {
  DragDropProvider,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
} from '@dnd-kit/react';
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable';
import { useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import type { PhotoDraftGalleryItem } from './PhotoDraftGallery';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './PhotoArrangeTask.css';

/** Stable identity-based insertion, shared by drag and single-pointer controls. */
export function insertMedia(
  keys: readonly string[],
  key: string,
  target: number,
): string[] {
  const index = keys.indexOf(key);
  if (index < 0 || target < 0 || target >= keys.length) return [...keys];
  const next = keys.filter((item) => item !== key);
  next.splice(target, 0, key);
  return next;
}

function SortableMedia({
  item,
  index,
  count,
  selected,
  onSelect,
}: {
  item: PhotoDraftGalleryItem;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const reduced = globalThis.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const { ref, handleRef, isDragging } = useSortable({
    id: item.key,
    index,
    transition: reduced ? null : undefined,
    sensors: [
      PointerSensor.configure({
        activationConstraints: [
          new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 }),
        ],
      }),
      KeyboardSensor,
    ],
  });
  return (
    <li ref={ref} className={isDragging ? 'is-dragging' : ''}>
      <button
        type="button"
        className="photo-draft-tile"
        data-media-key={item.key}
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={
          t('memory.photoPosition', { position: index + 1, count }) +
          `: ${item.name}`
        }
      >
        <span className="photo-draft-tile-preview">{item.preview}</span>
        <span className="photo-draft-number" aria-hidden="true">
          {index + 1}
        </span>
      </button>
      <button
        type="button"
        ref={handleRef}
        className="media-arrange-handle secondary"
        aria-label={t('experiences.moveHandle', { name: item.name })}
      >
        ⠿
      </button>
    </li>
  );
}

/** Local subtask: cancel discards; Finish updates only the parent draft. */
export function PhotoArrangeTask({
  items,
  onFinish,
  onClose,
}: {
  items: PhotoDraftGalleryItem[];
  onFinish: (keys: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const reduced = globalThis.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const [keys, setKeys] = useState(() => items.map((item) => item.key));
  const [selected, setSelected] = useState(items[0]?.key ?? '');
  const [announcement, setAnnouncement] = useState('');
  const available = new Map(items.map((item) => [item.key, item]));
  const ordered = keys.flatMap((key) => {
    const item = available.get(key);
    return item ? [item] : [];
  });
  const index = keys.indexOf(selected);
  function move(key: string, target: number) {
    setKeys((current) => insertMedia(current, key, target));
    setSelected(key);
    setAnnouncement(
      t('memory.photoMoved', {
        name: available.get(key)?.name,
        position: target + 1,
        count: keys.length,
      }),
    );
  }
  const controls = (
    <fieldset className="media-arrange-controls">
      <legend>{available.get(selected)?.name}</legend>
      {(['first', 'earlier', 'later', 'last'] as const).map((action) => {
        const target =
          action === 'first'
            ? 0
            : action === 'last'
              ? keys.length - 1
              : index + (action === 'earlier' ? -1 : 1);
        return (
          <button
            key={action}
            type="button"
            className="secondary"
            disabled={
              index < 0 ||
              target < 0 ||
              target >= keys.length ||
              target === index
            }
            onClick={() => move(selected, target)}
          >
            {t(`experiences.${action}`)}
          </button>
        );
      })}
    </fieldset>
  );
  return (
    <ShortTaskSheet
      open
      title={t('experiences.arrange')}
      onClose={onClose}
      ref={sheet}
      className="media-arrange-task"
      closeLabel={t('experiences.cancel')}
      footer={
        <>
          {controls}
          <button
            type="button"
            className="primary"
            onClick={() => {
              onFinish(keys);
              sheet.current?.closeForNavigation(() => {});
            }}
          >
            {t('experiences.finish')}
          </button>
        </>
      }
    >
      <p className="field-help">{t('experiences.arrangeHelp')}</p>
      <DragDropProvider
        plugins={(defaults) => [
          ...defaults,
          Feedback.configure({
            dropAnimation: reduced ? null : undefined,
            keyboardTransition: reduced ? null : undefined,
          }),
          Accessibility.configure({
            screenReaderInstructions: {
              draggable: t('experiences.keyboardHelp'),
            },
            announcements: {
              dragstart: () => t('experiences.dragStarted'),
              dragend: (event: DragEndEvent) =>
                event.canceled
                  ? t('experiences.dragCancelled')
                  : t('experiences.dragFinished'),
            },
          }),
        ]}
        onDragEnd={(event) => {
          if (event.canceled || !isSortableOperation(event.operation)) return;
          const { source } = event.operation;
          if (source) move(String(source.id), source.index);
        }}
      >
        <ol
          className="photo-draft-grid media-arrange-grid"
          aria-label={t('video.selected')}
        >
          {ordered.map((item, position) => (
            <SortableMedia
              key={item.key}
              item={item}
              index={position}
              count={items.length}
              selected={selected === item.key}
              onSelect={() => setSelected(item.key)}
            />
          ))}
        </ol>
      </DragDropProvider>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </ShortTaskSheet>
  );
}
