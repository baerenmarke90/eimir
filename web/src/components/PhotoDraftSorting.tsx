import {
  Accessibility,
  Feedback,
  PointerActivationConstraints,
} from '@dnd-kit/dom';
import {
  DragDropProvider,
  type DragEndEvent,
  PointerSensor,
} from '@dnd-kit/react';
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable';
import { type ReactNode, useCallback } from 'react';
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
            draggable: '',
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
  disabled,
  reorderable,
  children,
}: PhotoDraftItemProps) {
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
        activatorElements: (source) => [source.handle],
        preventActivation: (event) =>
          !(event.target instanceof Element) ||
          !event.target.closest('.photo-draft-tile'),
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
    ],
  });
  const attach = useCallback(
    (element: HTMLLIElement | null) => {
      ref(element);
      handleRef(element?.querySelector('.photo-draft-tile') ?? null);
    },
    [ref, handleRef],
  );
  return (
    <li
      ref={attach}
      className={`photo-draft-item${isDragging ? ' is-dragging' : ''}`}
    >
      {children}
    </li>
  );
}
