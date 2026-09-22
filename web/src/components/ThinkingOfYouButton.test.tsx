import '../i18n';
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import relationshipComponents from '../i18n/locales/relationshipComponents';
import { ThinkingOfYouButton } from './ThinkingOfYouButton';

describe('ThinkingOfYouButton', () => {
  afterEach(() => {
    cleanup();
  });

  const expectedPartnerLabel =
    relationshipComponents.thinkingOfYouSendToPartner.replace(
      '{{partner}}',
      'Lea',
    );

  it('uses only the partner first name in the personalized idle label', () => {
    render(<ThinkingOfYouButton partnerName="Lea Winter" />);

    const btn = screen.getByRole('button', {
      name: expectedPartnerLabel,
    });
    expect(btn.getAttribute('aria-label')).toBe(expectedPartnerLabel);
    expect(btn.getAttribute('title')).toBe(expectedPartnerLabel);
    expect(btn.getAttribute('aria-label')).not.toContain('Winter');
    expect(btn.getAttribute('title')).not.toContain('Winter');
    expect(
      screen.getByText(relationshipComponents.thinkingOfYouAction),
    ).toBeDefined();
  });

  it('transitions to sending and then sent on click with proper aria-busy and label semantics', async () => {
    let resolveSend!: () => void;
    const sendPromise = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });
    const onSend = vi.fn().mockReturnValue(sendPromise);
    render(<ThinkingOfYouButton partnerName="Lea" onSend={onSend} />);

    const btn = screen.getByRole('button', {
      name: expectedPartnerLabel,
    });
    fireEvent.click(btn);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe(
      relationshipComponents.thinkingOfYouSending,
    );

    resolveSend();

    await waitFor(() => {
      expect(btn.getAttribute('aria-busy')).toBeNull();
      expect(btn.getAttribute('aria-label')).toBe(
        relationshipComponents.thinkingOfYouSent,
      );
      expect(btn.className).toContain('state-sent');
    });
  });

  it('handles error in onSend gracefully and restores idle state', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<ThinkingOfYouButton partnerName="Lea" onSend={onSend} />);

    const btn = screen.getByRole('button', {
      name: expectedPartnerLabel,
    });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn.getAttribute('aria-busy')).toBeNull();
      expect(btn.getAttribute('aria-label')).toBe(
        relationshipComponents.thinkingOfYouError,
      );
      expect(btn.className).toContain('state-error');
    });
  });

  it('does not schedule a reset after a pending send outlives unmount', async () => {
    vi.useFakeTimers();
    try {
      let resolveSend!: () => void;
      const sendPromise = new Promise<void>((resolve) => {
        resolveSend = resolve;
      });
      const { unmount } = render(
        <ThinkingOfYouButton partnerName="Lea" onSend={() => sendPromise} />,
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: expectedPartnerLabel,
        }),
      );
      unmount();

      await act(async () => {
        resolveSend();
        await sendPromise;
      });

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('clears an owned confirmation reset timer on unmount', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <ThinkingOfYouButton
          partnerName="Lea"
          onSend={() => Promise.resolve()}
        />,
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: expectedPartnerLabel,
          }),
        );
        await Promise.resolve();
      });

      expect(
        screen.getByRole('button', {
          name: relationshipComponents.thinkingOfYouSent,
        }),
      ).toBeDefined();
      expect(vi.getTimerCount()).toBe(1);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('respects disabled state', () => {
    const onSend = vi.fn();
    render(
      <ThinkingOfYouButton partnerName="Lea" disabled={true} onSend={onSend} />,
    );

    const btn = screen.getByRole('button', {
      name: expectedPartnerLabel,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders compact variant with icon only', () => {
    render(<ThinkingOfYouButton variant="compact" partnerName="Lea" />);

    const btn = screen.getByRole('button', {
      name: expectedPartnerLabel,
    });
    expect(btn.className).toContain('thinking-of-you-compact');
    expect(
      screen.queryByText(relationshipComponents.thinkingOfYouAction),
    ).toBeNull();
  });

  it('uses the exact product copy "Ich denke an dich", not "Ich denk an dich" (regression #790/#791)', () => {
    expect(relationshipComponents.thinkingOfYouAction).toBe(
      'Ich denke an dich',
    );
  });

  it('disables the control and shows the server-authoritative remaining time during cooldown', () => {
    const onSend = vi.fn();
    const cooldownUntil = new Date(Date.now() + 29 * 60_000);
    render(
      <ThinkingOfYouButton
        partnerName="Lea"
        onSend={onSend}
        cooldownUntil={cooldownUntil}
      />,
    );

    const expectedLabel = relationshipComponents.thinkingOfYouCooldown.replace(
      '{{minutes}}',
      '29',
    );
    const btn = screen.getByRole('button', {
      name: expectedLabel,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('state-cooldown');

    fireEvent.click(btn);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('restores the normal action automatically once the cooldown expires, without a page reload', () => {
    vi.useFakeTimers();
    try {
      const cooldownUntil = new Date(Date.now() + 60_000);
      render(
        <ThinkingOfYouButton partnerName="Lea" cooldownUntil={cooldownUntil} />,
      );

      expect(
        screen.getByRole('button', { name: /Wieder möglich/ }),
      ).toBeDefined();

      // Advance past both the cooldown expiry and the button's own
      // remaining-time refresh tick.
      act(() => {
        vi.advanceTimersByTime(90_000);
      });

      expect(
        screen.getByRole('button', { name: expectedPartnerLabel }),
      ).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
