import {
  Accessibility,
  Feedback,
  PointerActivationConstraints,
} from '@dnd-kit/dom';
import {
  DragDropProvider,
  KeyboardSensor,
  PointerSensor,
} from '@dnd-kit/react';
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable';
import { OptimisticSortingPlugin } from '@dnd-kit/dom/sortable';
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
  onAnnounce,
}: {
  children: ReactNode;
  onAnnounce: (message: string) => void;
  onMove: (key: string, target: number) => void;
}) {
  const { t } = useTranslation();
  const reduced = globalThis.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  return (
    <DragDropProvider
      plugins={(defaults) => [
        // Native selection semantics must not be overwritten by drag pressed state.
        ...defaults.filter((plugin) => plugin !== Accessibility),
        Feedback.configure({
          dropAnimation: reduced ? null : undefined,
          keyboardTransition: reduced ? null : undefined,
        }),
      ]}
      onDragStart={() => onAnnounce(t('experiences.dragStarted'))}
      onDragEnd={(event) => {
        onAnnounce(
          t(
            event.canceled
              ? 'experiences.dragCancelled'
              : 'experiences.dragFinished',
          ),
        );
        if (event.canceled || !isSortableOperation(event.operation)) return;
        const { source, target } = event.operation;
        if (source && target) onMove(String(source.id), target.index);
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
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id,
    index,
    disabled: disabled || !reorderable,
    transition: reduced ? null : undefined,
    // Keep large-photo drop targets stable; commit insertion only on release.
    plugins: (defaults) =>
      defaults.filter((plugin) => plugin !== OptimisticSortingPlugin),
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
      KeyboardSensor.configure({
        keyboardCodes: {
          ...KeyboardSensor.defaults.keyboardCodes,
          start: ['Space'],
        },
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
      className={`photo-draft-item${isDragging ? ' is-dragging' : isDropTarget ? ' is-drop-target' : ''}`}
    >
      {children}
    </li>
  );
}
