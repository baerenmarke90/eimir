import { useCallback, useState } from 'react';

type ItemSheetKind = 'menu' | 'delete';

/**
 * Which item sheet (the actions menu or the delete confirmation) is open, and
 * for which item. A sheet belongs to the item it was opened for, so a reused
 * route that switches to another item never inherits an open sheet.
 */
export function useItemSheets(itemId: string | undefined) {
  const [open, setOpen] = useState<{
    itemId: string;
    kind: ItemSheetKind;
  } | null>(null);
  const isOpen = (kind: ItemSheetKind) =>
    open?.kind === kind && open.itemId === itemId;
  const show = useCallback(
    (kind: ItemSheetKind) => {
      if (itemId) setOpen({ itemId, kind });
    },
    [itemId],
  );
  /** Closes the named sheet only; a sheet opened in its place stays open. */
  const close = useCallback(
    (kind: ItemSheetKind) =>
      setOpen((current) => (current?.kind === kind ? null : current)),
    [],
  );
  return {
    menuOpen: isOpen('menu'),
    deleteOpen: isOpen('delete'),
    show,
    close,
    closeAll: useCallback(() => setOpen(null), []),
  };
}
