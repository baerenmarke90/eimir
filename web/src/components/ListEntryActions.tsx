import {
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AddIcon } from './DestinationIcon';
import './ListEntryActions.css';

export function moveSortableItem(
  itemIds: readonly string[],
  itemId: string,
  targetId: string,
  placement: 'before' | 'after',
): string[] {
  if (itemId === targetId) return [...itemIds];
  if (!itemIds.includes(itemId) || !itemIds.includes(targetId)) {
    return [...itemIds];
  }

  const next = itemIds.filter((id) => id !== itemId);
  const targetIndex = next.indexOf(targetId);
  const insertAt = placement === 'after' ? targetIndex + 1 : targetIndex;
  next.splice(insertAt, 0, itemId);
  return next;
}

export function moveSortableItemByOffset(
  itemIds: readonly string[],
  itemId: string,
  direction: -1 | 1,
): string[] {
  const currentIndex = itemIds.indexOf(itemId);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= itemIds.length) {
    return [...itemIds];
  }

  const next = [...itemIds];
  [next[currentIndex], next[targetIndex]] = [
    next[targetIndex],
    next[currentIndex],
  ];
  return next;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((itemId, index) => itemId === right[index])
  );
}

type DragState = {
  itemId: string;
  pointerId: number;
  initialOrder: string[];
  order: string[];
  clientX: number;
  clientY: number;
  scrollContainer: HTMLElement;
};

function scrollContainerFor(handle: HTMLElement): HTMLElement {
  for (
    let parent = handle.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const overflow = getComputedStyle(parent).overflowY;
    if (
      /auto|scroll/.test(overflow) &&
      parent.scrollHeight > parent.clientHeight
    )
      return parent;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

export function useListItemReorder({
  itemIds,
  disabled,
  onReorder,
  animatePreview = false,
}: {
  itemIds: readonly string[];
  disabled: boolean;
  onReorder: (itemIds: string[], movedId: string) => void;
  animatePreview?: boolean;
}) {
  const dragRef = useRef<DragState | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const previousRects = useRef<Map<string, number> | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  function captureRects() {
    if (!animatePreview) return;
    previousRects.current = new Map(
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-sortable-item-id]'),
      )
        .filter((row) => itemIds.includes(row.dataset.sortableItemId ?? ''))
        .map((row) => [
          row.dataset.sortableItemId ?? '',
          row.getBoundingClientRect().top,
        ]),
    );
  }

  useLayoutEffect(() => {
    const before = previousRects.current;
    previousRects.current = null;
    if (
      !before ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const rawDuration = getComputedStyle(document.documentElement)
      .getPropertyValue('--duration-transition')
      .trim();
    const duration = rawDuration.endsWith('ms')
      ? parseFloat(rawDuration)
      : parseFloat(rawDuration) * 1000;
    const easing =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--easing-standard')
        .trim() || 'ease-out';
    for (const row of document.querySelectorAll<HTMLElement>(
      '[data-sortable-item-id]',
    )) {
      const oldTop = before.get(row.dataset.sortableItemId ?? '');
      if (oldTop === undefined || typeof row.animate !== 'function') continue;
      const displacement = oldTop - row.getBoundingClientRect().top;
      if (Math.abs(displacement) < 1) continue;
      row.animate(
        [
          { transform: `translateY(${displacement}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: Number.isFinite(duration) ? duration : 180, easing },
      );
    }
  }, [itemIds, previewOrder, animatePreview]);

  useEffect(
    () => () => {
      dragRef.current = null;
      if (scrollFrame.current !== null)
        cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function updateTarget(drag: DragState) {
    const element = document.elementFromPoint(drag.clientX, drag.clientY);
    const row = element?.closest(
      '[data-sortable-item-id]',
    ) as HTMLElement | null;
    const targetId = row?.dataset.sortableItemId;
    if (
      !row ||
      !targetId ||
      targetId === drag.itemId ||
      !drag.order.includes(targetId)
    )
      return;
    const bounds = row.getBoundingClientRect();
    const placement =
      drag.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';
    const next = moveSortableItem(drag.order, drag.itemId, targetId, placement);
    if (!sameOrder(drag.order, next)) {
      captureRects();
      drag.order = next;
      setPreviewOrder(next);
    }
  }

  function autoScroll() {
    const drag = dragRef.current;
    if (!drag) return;
    const container = drag.scrollContainer;
    const isDocument =
      container === document.scrollingElement ||
      container === document.documentElement;
    const bounds = isDocument
      ? { top: 0, bottom: window.innerHeight }
      : container.getBoundingClientRect();
    const direction =
      drag.clientY < bounds.top + 56
        ? -1
        : drag.clientY > bounds.bottom - 56
          ? 1
          : 0;
    if (direction) {
      if (isDocument) window.scrollBy(0, direction * 12);
      else container.scrollBy(0, direction * 12);
      updateTarget(drag);
      scrollFrame.current = requestAnimationFrame(autoScroll);
    } else {
      scrollFrame.current = null;
    }
  }

  function finishPointer(
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean,
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    setPreviewOrder(null);
    setActiveItemId(null);

    if (commit && !sameOrder(drag.initialOrder, drag.order)) {
      onReorder(drag.order, drag.itemId);
    }
  }

  function handleProps(
    itemId: string,
  ): ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      disabled,
      onKeyDown: (event) => {
        if (disabled) return;
        const direction =
          event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (direction === 0) return;

        event.preventDefault();
        const next = moveSortableItemByOffset(
          itemIds,
          itemId,
          direction as -1 | 1,
        );
        if (!sameOrder(itemIds, next)) {
          captureRects();
          onReorder(next, itemId);
        }
      },
      onPointerDown: (event) => {
        if (disabled || event.button !== 0) return;
        const initialOrder = [...itemIds];
        dragRef.current = {
          itemId,
          pointerId: event.pointerId,
          initialOrder,
          order: initialOrder,
          clientX: event.clientX,
          clientY: event.clientY,
          scrollContainer: scrollContainerFor(event.currentTarget),
        };
        setPreviewOrder(initialOrder);
        setActiveItemId(itemId);
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      onPointerMove: (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        drag.clientX = event.clientX;
        drag.clientY = event.clientY;
        updateTarget(drag);
        if (scrollFrame.current === null) autoScroll();
      },
      onPointerUp: (event) => finishPointer(event, true),
      onPointerCancel: (event) => finishPointer(event, false),
    };
  }

  return {
    activeItemId,
    orderedItemIds: previewOrder ?? [...itemIds],
    handleProps,
  };
}

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'title' | 'children'
> & {
  label: string;
  icon: 'save' | 'delete' | 'reorder' | 'add' | 'edit';
  variant?: 'tertiary' | 'add';
};

export const ListEntryIconButton = forwardRef<
  HTMLButtonElement,
  IconButtonProps
>(function ListEntryIconButton(
  {
    label,
    icon,
    variant = icon === 'add' ? 'add' : 'tertiary',
    className,
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = [
    'list-entry-icon-button',
    variant === 'add' ? 'list-entry-add-button' : null,
    icon === 'reorder' ? 'list-entry-drag-handle' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      {...props}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
    >
      <ListEntryIcon kind={icon} />
    </button>
  );
});

export function EditPencilIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={className}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function ListEntryIcon({ kind }: { kind: IconButtonProps['icon'] }) {
  if (kind === 'add') {
    return <AddIcon className="list-entry-icon" />;
  }

  if (kind === 'edit') {
    return <EditPencilIcon className="list-entry-icon" />;
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="list-entry-icon"
    >
      {kind === 'save' ? (
        <>
          <path d="M5 3h11l3 3v15H5z" />
          <path d="M8 3v6h8V3" />
          <path d="M8 14h8v7H8z" />
        </>
      ) : null}
      {kind === 'delete' ? (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="m6 7 1 14h10l1-14" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </>
      ) : null}
      {kind === 'reorder' ? (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </>
      ) : null}
    </svg>
  );
}
