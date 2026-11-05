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
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';

/** Insert by identity so uploads and the chosen cover keep their owners. */
export function insertMedia(
  keys: readonly string[],
  key: string,
  target: number,
): string[] {
  const index = keys.indexOf(key);
  if (
    index < 0 ||
    !Number.isInteger(target) ||
    target < 0 ||
    target >= keys.length
  )
    return [...keys];
  const next = keys.filter((item) => item !== key);
  next.splice(target, 0, key);
  return next;
}

export function PhotoDraftSorting({
  children,
  onMove,
}: {
  children: ReactNode;
  onMove: (key: string, target: number) => void;
}) {
  const { t } = useTranslation();
  const reduced = globalThis.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  return (
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
        if (source) onMove(String(source.id), source.index);
      }}
    >
      {children}
    </DragDropProvider>
  );
}

interface PhotoDraftItemProps {
  id: string;
  index: number;
  name: string;
  disabled: boolean;
  reorderable: boolean;
  children: ReactNode;
}

export function SortablePhotoDraftItem(props: PhotoDraftItemProps) {
  return props.reorderable ? (
    <ReorderablePhotoDraftItem {...props} />
  ) : (
    <li className="photo-draft-item">{props.children}</li>
  );
}

function ReorderablePhotoDraftItem({
  id,
  index,
  name,
  disabled,
  reorderable,
  children,
}: PhotoDraftItemProps) {
  const { t } = useTranslation();
  const reduced = globalThis.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    disabled: disabled || !reorderable,
    transition: reduced ? null : undefined,
    sensors: [
      PointerSensor.configure({
        activatorElements: (source) => [
          source.element?.querySelector('.photo-draft-tile') ?? undefined,
          source.handle,
        ],
        preventActivation: (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return true;
          // Touch scrolls on the photo; its integrated grip owns touch dragging.
          return event.pointerType === 'touch'
            ? !target.closest('.photo-draft-drag-handle')
            : !target.closest('.photo-draft-tile, .photo-draft-drag-handle');
        },
        activationConstraints: (event) =>
          event.pointerType === 'touch'
            ? [
                new PointerActivationConstraints.Delay({
                  value: 250,
                  tolerance: 8,
                }),
              ]
            : [new PointerActivationConstraints.Distance({ value: 5 })],
      }),
      KeyboardSensor,
    ],
  });
  return (
    <li
      ref={ref}
      className={`photo-draft-item${isDragging ? ' is-dragging' : ''}`}
    >
      {children}
      {reorderable ? (
        <button
          type="button"
          ref={handleRef}
          className="photo-draft-drag-handle"
          disabled={disabled}
          aria-label={t('experiences.moveHandle', { name })}
          title={t('experiences.moveHandle', { name })}
        >
          <span aria-hidden="true">{index + 1} ⠿</span>
        </button>
      ) : null}
    </li>
  );
}
