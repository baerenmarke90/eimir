// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useDismissiblePopover } from './useDismissiblePopover';

describe('useDismissiblePopover', () => {
  it('toggles open state and respects initial closed state', () => {
    const { result } = renderHook(() => useDismissiblePopover(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('closes on outside pointer down, but stays open on inside pointer down', () => {
    const { result } = renderHook(() => useDismissiblePopover(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    const trigger = document.createElement('button');
    const panel = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(trigger);
    document.body.appendChild(panel);
    document.body.appendChild(outside);

    result.current.triggerRef.current = trigger;
    result.current.panelRef.current = panel;

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    // Click inside panel
    act(() => {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      panel.dispatchEvent(event);
    });
    expect(result.current.isOpen).toBe(true);

    // Click inside trigger
    act(() => {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      trigger.dispatchEvent(event);
    });
    expect(result.current.isOpen).toBe(true);

    // Click outside
    act(() => {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      outside.dispatchEvent(event);
    });
    expect(result.current.isOpen).toBe(false);

    document.body.removeChild(trigger);
    document.body.removeChild(panel);
    document.body.removeChild(outside);
  });

  it('closes on Escape key and restores focus to trigger', () => {
    const { result } = renderHook(() => useDismissiblePopover(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const focusSpy = vi.spyOn(trigger, 'focus');
    result.current.triggerRef.current = trigger;

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(event);
    });

    expect(result.current.isOpen).toBe(false);
    expect(focusSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(trigger);
  });

  it('closes on Escape without restoring focus when restoreFocusOnEscape is false', () => {
    const { result } = renderHook(
      () => useDismissiblePopover({ restoreFocusOnEscape: false }),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
    );

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const focusSpy = vi.spyOn(trigger, 'focus');
    result.current.triggerRef.current = trigger;

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(event);
    });

    expect(result.current.isOpen).toBe(false);
    expect(focusSpy).not.toHaveBeenCalled();

    document.body.removeChild(trigger);
  });
});
