// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinkPreviewsApi } from '../api/generated/apis/LinkPreviewsApi';
import { authoredLinks } from '../client/authoredLinks';
import { AuthoredText } from './AuthoredText';
import storyProducts from '../i18n/locales/storyProducts';

afterEach(cleanup);

describe('authored text and external previews', () => {
  it('recognizes punctuation and balanced URL parentheses without turning HTML into markup', () => {
    const text =
      'Try https://example.org/a_(b).\n<script>alert(1)</script> www.example.org/next';
    const { container } = render(<AuthoredText text={text} />);
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual(['https://example.org/a_(b)', 'http://www.example.org/next']);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noreferrer');
    }
  });

  it('rejects executable schemes and credential-bearing navigation', () => {
    expect(
      authoredLinks('javascript:alert(1) data:text/html,x file:///etc/passwd'),
    ).toEqual([]);
    expect(authoredLinks('https://user:password@example.org/')).toEqual([]);
  });

  it('makes no request until explicitly selected and then sends only the selected URL', async () => {
    const resolve = vi.fn().mockResolvedValue({
      available: true,
      title: 'A park',
      description: '<b>Inert description</b>',
    });
    const api = { resolveLinkPreview: resolve } as unknown as LinkPreviewsApi;
    const { container } = render(
      <AuthoredText
        text="A private picnic idea: https://example.org/park"
        previewApi={api}
        spaceId="space-a"
      />,
    );
    expect(resolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button'));
    await screen.findByText('A park');
    expect(resolve).toHaveBeenCalledExactlyOnceWith({
      spaceId: 'space-a',
      linkPreviewRequest: { url: 'https://example.org/park' },
    });
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>Inert description</b>')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: /A park/ }),
    );
  });

  it('keeps the original link and permits an explicit retry when the destination fails', async () => {
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue({ available: false });
    render(
      <AuthoredText
        text="https://example.org/"
        previewApi={
          { resolveLinkPreview: resolve } as unknown as LinkPreviewsApi
        }
        spaceId="space-a"
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        storyProducts.authoredLinks.unavailable,
      ),
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://example.org/',
    );
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
  });

  it('admits one request for repeated synchronous activation', async () => {
    const resolve = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <AuthoredText
        text="https://example.org/"
        previewApi={
          { resolveLinkPreview: resolve } as unknown as LinkPreviewsApi
        }
        spaceId="space-a"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('deduplicates and bounds preview choices while retaining every ordinary link', () => {
    render(
      <AuthoredText
        text="https://example.org/1 https://example.org/1 https://example.org/2 https://example.org/3 https://example.org/4 http://example.org/5"
        previewApi={{} as LinkPreviewsApi}
        spaceId="space-a"
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('discards late feedback on a changed account/space and resets an interrupted offline attempt', async () => {
    let finish!: (value: unknown) => void;
    const resolve = vi.fn().mockReturnValue(
      new Promise((done) => {
        finish = done;
      }),
    );
    const api = { resolveLinkPreview: resolve } as unknown as LinkPreviewsApi;
    const props = {
      text: 'https://example.org/',
      previewApi: api,
      spaceId: 'space-a',
      scope: 'account-a',
    };
    const view = render(<AuthoredText {...props} />);
    await userEvent.click(screen.getByRole('button'));
    view.rerender(
      <AuthoredText {...props} spaceId="space-b" scope="account-b" />,
    );
    finish({ available: true, title: 'Old private result' });
    await waitFor(() =>
      expect(screen.queryByText('Old private result')).toBeNull(),
    );
    view.rerender(<AuthoredText {...props} offline />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<AuthoredText {...props} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
