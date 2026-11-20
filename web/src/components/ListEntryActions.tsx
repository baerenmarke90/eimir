import {
  type ButtonHTMLAttributes,
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { haptic } from '../motion/haptics';
import { prefersReducedMotion } from '../motion/reducedMotion';
import { captureLayout, type LayoutSnapshot, reorder } from '../motion/replace';
import './ListEntryActions.css';

/** Rows name their item with `data-sortable-item-id`. */
const SORTABLE_KEY = 'sortableItemId';

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
  initialY: number;
  initialScroll: number;
  row: HTMLElement;
  handle: HTMLButtonElement;
  parent: HTMLElement;
  positions: Map<string, { top: number; height: number }>;
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
  /**
   * Returns `true` when the caller accepted the order and will reflect it in
   * `itemIds`. Later moves then start from that order even before it renders.
   */
  onReorder: (itemIds: string[], movedId: string) => boolean | undefined;
  animatePreview?: boolean;
}) {
  const dragRef = useRef<DragState | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const previousRects = useRef<LayoutSnapshot | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const animations = useRef<Animation[]>([]);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  // Accepted orders that `itemIds` does not reflect yet. A caller may apply
  // its optimistic order after an asynchronous step, so a rapid second move
  // must start from the latest accepted order rather than from the last
  // rendered `itemIds`; otherwise the second move is lost (#1687).
  const requestedOrders = useRef<string[][]>([]);
  const orderSignature = itemIds.join('|');
  const confirmedOrder = useRef(orderSignature);
  useEffect(() => {
    if (confirmedOrder.current !== orderSignature) {
      const reached = requestedOrders.current.findIndex(
        (order) => order.join('|') === orderSignature,
      );
      // An order that matches no accepted request (a failed save restored,
      // or another device's order) supersedes every pending request.
      requestedOrders.current =
        reached < 0 ? [] : requestedOrders.current.slice(reached + 1);
      if (!dragRef.current)
        setPreviewOrder(requestedOrders.current.at(-1) ?? null);
    }
    confirmedOrder.current = orderSignature;
  }, [orderSignature]);

  function latestOrder(): readonly string[] {
    return requestedOrders.current.at(-1) ?? itemIds;
  }

  function requestOrder(order: string[], movedId: string): boolean {
    if (onReorder(order, movedId) !== true) return false;
    requestedOrders.current = [...requestedOrders.current, order];
    return true;
  }

  function captureRects() {
    if (!animatePreview) return;
    const layout = captureLayout(listRef.current, SORTABLE_KEY);
    for (const id of layout.keys())
      if (!itemIds.includes(id)) layout.delete(id);
    previousRects.current = layout;
  }

  useLayoutEffect(() => {
    const before = previousRects.current;
    previousRects.current = null;
    const drag = dragRef.current;
    if (before || drag) {
      for (const animation of animations.current) animation.cancel();
      animations.current = [];
    }
    if (drag) {
      // Moving a keyed row in the DOM can release browser pointer capture.
      // Restore it after layout so the same handle owns the entire drag.
      if (!drag.handle.hasPointerCapture(drag.pointerId)) {
        drag.handle.setPointerCapture(drag.pointerId);
      }
      drag.row.style.removeProperty('transform');
      const original = drag.positions.get(drag.itemId);
      if (original) {
        const scrollDelta = drag.scrollContainer.scrollTop - drag.initialScroll;
        const offset =
          original.top +
          drag.clientY -
          drag.initialY -
          scrollDelta -
          drag.row.getBoundingClientRect().top;
        drag.row.style.transform = `translateY(${offset}px)`;
      }
    }
    // Replace `reorder` (Motion Contract 4.2): siblings move from their
    // measured old place; a dropped row continues from where the finger left
    // it into its slot. With reduced motion every row is in place at once.
    if (!before || prefersReducedMotion()) return;
    animations.current = reorder(listRef.current, before, {
      key: SORTABLE_KEY,
      skip: drag?.row,
    });
  });

  useEffect(
    () => () => {
      dragRef.current?.row.style.removeProperty('transform');
      dragRef.current = null;
      for (const animation of animations.current) animation.cancel();
      if (scrollFrame.current !== null)
        cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function updateTarget(drag: DragState) {
    const original = drag.positions.get(drag.itemId);
    if (!original) return;
    const scrollDelta = drag.scrollContainer.scrollTop - drag.initialScroll;
    const center =
      original.top +
      original.height / 2 +
      drag.clientY -
      drag.initialY +
      scrollDelta;
    const next = drag.initialOrder.filter((id) => id !== drag.itemId);
    const targetIndex = next.findIndex((id) => {
      const bounds = drag.positions.get(id);
      return bounds && center < bounds.top + bounds.height / 2;
    });
    next.splice(targetIndex < 0 ? next.length : targetIndex, 0, drag.itemId);
    if (!sameOrder(drag.order, next)) {
      captureRects();
      drag.order = next;
      setPreviewOrder(next);
      // The held row crossed into another slot (Motion Contract 4.10).
      haptic('threshold');
    }
    // The held item follows the pointer, independent of sibling FLIP motion.
    drag.row.style.removeProperty('transform');
    const offset =
      original.top +
      drag.clientY -
      drag.initialY -
      scrollDelta -
      drag.row.getBoundingClientRect().top;
    drag.row.style.transform = `translateY(${offset}px)`;
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

    captureRects();
    drag.row.style.removeProperty('transform');
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPreviewOrder(commit ? drag.order : null);
    setActiveItemId(null);

    if (commit && !sameOrder(drag.initialOrder, drag.order)) {
      if (requestOrder(drag.order, drag.itemId)) haptic('commit');
    }
  }

  function handleProps(
    itemId: string,
  ): ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      disabled,
      onKeyDown: (event) => {
        if (disabled) return;
        listRef.current =
          event.currentTarget.closest('[data-sortable-item-id]')
            ?.parentElement ?? null;
        const direction =
          event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (direction === 0) return;

        event.preventDefault();
        const current = latestOrder();
        const next = moveSortableItemByOffset(
          current,
          itemId,
          direction as -1 | 1,
        );
        if (!sameOrder(current, next)) {
          captureRects();
          if (requestOrder(next, itemId)) setPreviewOrder(next);
        }
      },
      onPointerDown: (event) => {
        if (disabled || event.button !== 0) return;
        const row = event.currentTarget.closest<HTMLElement>(
          '[data-sortable-item-id]',
        );
        const parent = row?.parentElement;
        if (!row || !parent) return;
        listRef.current = parent;
        for (const animation of animations.current) animation.cancel();
        animations.current = [];
        const scrollContainer = scrollContainerFor(event.currentTarget);
        const initialOrder = [...latestOrder()];
        dragRef.current = {
          itemId,
          pointerId: event.pointerId,
          initialOrder,
          order: initialOrder,
          clientX: event.clientX,
          clientY: event.clientY,
          scrollContainer,
          initialY: event.clientY,
          initialScroll: scrollContainer.scrollTop,
          row,
          handle: event.currentTarget,
          parent,
          positions: new Map(
            Array.from(
              parent.querySelectorAll<HTMLElement>('[data-sortable-item-id]'),
            ).map((element) => [
              element.dataset.sortableItemId ?? '',
              element.getBoundingClientRect(),
            ]),
          ),
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
      onLostPointerCapture: (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId))
          finishPointer(event, false);
      },
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
  icon: 'save' | 'delete' | 'reorder' | 'edit' | 'more' | 'unlink';
};

export const ListEntryIconButton = forwardRef<
  HTMLButtonElement,
  IconButtonProps
>(function ListEntryIconButton(
  { label, icon, className, type = 'button', ...props },
  ref,
) {
  const classes = [
    'list-entry-icon-button',
    icon === 'edit' ? 'content-edit-action' : null,
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
      className={className ? `inline-icon ${className}` : 'inline-icon'}
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export function ListEntryIcon({ kind }: { kind: IconButtonProps['icon'] }) {
  if (kind === 'edit') {
    return <EditPencilIcon className="list-entry-icon" />;
  }
  if (kind === 'unlink') {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        className="list-entry-icon inline-icon"
      >
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="list-entry-icon inline-icon"
    >
      {kind === 'more' ? (
        <>
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </>
      ) : null}
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
          <circle cx="9" cy="6" r="1.2" />
          <circle cx="15" cy="6" r="1.2" />
          <circle cx="9" cy="12" r="1.2" />
          <circle cx="15" cy="12" r="1.2" />
          <circle cx="9" cy="18" r="1.2" />
          <circle cx="15" cy="18" r="1.2" />
        </>
      ) : null}
    </svg>
  );
}
