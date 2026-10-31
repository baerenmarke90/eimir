import type { KeyboardEvent } from 'react';

/** Horizontal tablists own enabled direct button tabs; selection may commit later. */
export function handleTabKeyDown(
  event: KeyboardEvent<HTMLElement>,
  select: (tab: HTMLButtonElement) => void,
): void {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.nativeEvent.isComposing ||
    !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  )
    return;
  const current =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button[role="tab"]')
      : null;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      ':scope > button[role="tab"]',
    ),
  ).filter(
    (tab) =>
      !tab.disabled &&
      !tab.hidden &&
      tab.getAttribute('aria-disabled') !== 'true',
  );
  const index = current ? tabs.indexOf(current) : -1;
  if (index < 0) return;
  const next =
    event.key === 'Home'
      ? tabs[0]
      : event.key === 'End'
        ? tabs[tabs.length - 1]
        : tabs[
            (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
              tabs.length
          ];
  event.preventDefault();
  if (next === current) return;
  select(next);
  next.focus();
}
