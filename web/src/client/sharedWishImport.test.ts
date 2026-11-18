// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ read }),
  Capacitor: { convertFileSrc: (uri: string) => uri },
}));

import {
  extractSharedWishContent,
  readSharedWishImage,
  SHARED_WISH_DESCRIPTION_MAX,
  SHARED_WISH_PHOTO_MAX_BYTES,
  SHARED_WISH_TITLE_MAX,
} from './sharedWishImport';

afterEach(() => {
  vi.unstubAllGlobals();
  read.mockReset();
});

describe('extractSharedWishContent', () => {
  it('splits a text line followed by a link', () => {
    expect(
      extractSharedWishContent(
        'This tent would be great\nhttps://shop.example/zelt',
      ),
    ).toEqual({
      title: 'This tent would be great',
      linkUrl: 'https://shop.example/zelt',
    });
  });

  it('gives a link-only share a link and no title', () => {
    expect(extractSharedWishContent('  https://shop.example/zelt \n')).toEqual({
      linkUrl: 'https://shop.example/zelt',
    });
  });

  it('keeps a caption without a link as title only', () => {
    expect(extractSharedWishContent('Sunset by the sea')).toEqual({
      title: 'Sunset by the sea',
    });
  });

  it('returns nothing for empty or missing text', () => {
    expect(extractSharedWishContent('')).toEqual({});
    expect(extractSharedWishContent(null)).toEqual({});
    expect(extractSharedWishContent(' \n\t ')).toEqual({});
  });

  it('removes trailing sentence punctuation from the link', () => {
    expect(
      extractSharedWishContent('Look https://example.com/a/b.'),
    ).toMatchObject({ linkUrl: 'https://example.com/a/b', title: 'Look.' });
    expect(
      extractSharedWishContent('How about this? https://example.com/x!'),
    ).toMatchObject({ linkUrl: 'https://example.com/x' });
  });

  it('does not keep a closing bracket that belongs to the sentence', () => {
    expect(
      extractSharedWishContent('Cafe (https://example.com/cafe)'),
    ).toMatchObject({ linkUrl: 'https://example.com/cafe' });
  });

  it('keeps a balanced bracket inside the link', () => {
    expect(
      extractSharedWishContent('https://example.com/wiki/Foo_(bar)'),
    ).toEqual({ linkUrl: 'https://example.com/wiki/Foo_(bar)' });
  });

  it('rejects a link with embedded credentials', () => {
    const content = extractSharedWishContent(
      'Here https://user:secret@example.com/x',
    );
    expect(content.linkUrl).toBeUndefined();
  });

  it('takes the first usable link and leaves the others in the text', () => {
    const content = extractSharedWishContent(
      'Two ideas\nhttps://one.example/a\nhttps://two.example/b',
    );
    expect(content.linkUrl).toBe('https://one.example/a');
    expect(content.title).toBe('Two ideas');
    expect(content.description).toBe('https://two.example/b');
  });

  it('skips a credentialed link and uses the next safe one', () => {
    expect(
      extractSharedWishContent(
        'https://a:b@bad.example/x https://good.example/y',
      ).linkUrl,
    ).toBe('https://good.example/y');
  });

  it('ignores non-web schemes', () => {
    expect(
      extractSharedWishContent('javascript:alert(1) ftp://files.example/x')
        .linkUrl,
    ).toBeUndefined();
  });

  it('rejects an over-long link', () => {
    const long = `https://example.com/${'a'.repeat(2100)}`;
    expect(extractSharedWishContent(long).linkUrl).toBeUndefined();
  });

  it('puts following lines into the description', () => {
    expect(
      extractSharedWishContent(
        'Weekend in Hamburg\n\nWith a harbour tour\nand fish rolls\nhttps://trip.example/hh',
      ),
    ).toEqual({
      title: 'Weekend in Hamburg',
      description: 'With a harbour tour\nand fish rolls',
      linkUrl: 'https://trip.example/hh',
    });
  });

  it('treats a link inside a sentence as the link and joins the rest', () => {
    expect(
      extractSharedWishContent('Look here https://x.example/a right now'),
    ).toEqual({
      title: 'Look here right now',
      linkUrl: 'https://x.example/a',
    });
  });

  it('keeps emoji intact and strips invisible chat marks', () => {
    expect(
      extractSharedWishContent('‎Great restaurant 🍝‏ https://m.example/r'),
    ).toEqual({
      title: 'Great restaurant 🍝',
      linkUrl: 'https://m.example/r',
    });
  });

  it('truncates a long first line without splitting an emoji', () => {
    const line = '🍝'.repeat(SHARED_WISH_TITLE_MAX + 20);
    const content = extractSharedWishContent(line);
    expect(Array.from(content.title ?? '')).toHaveLength(SHARED_WISH_TITLE_MAX);
    expect(content.description).toBe(line);
  });

  it('caps the description length', () => {
    const content = extractSharedWishContent(
      `Titel\n${'x'.repeat(SHARED_WISH_DESCRIPTION_MAX + 500)}`,
    );
    expect(content.description?.length).toBe(SHARED_WISH_DESCRIPTION_MAX);
  });

  it('normalizes Windows line endings', () => {
    expect(extractSharedWishContent('One\r\nTwo')).toEqual({
      title: 'One',
      description: 'Two',
    });
  });
});

describe('readSharedWishImage', () => {
  const uri = 'content://de.eimir.app.selectedmedia/12345678-abcd';

  it.each(['de.eimir.app', 'de.eimir.app.debug'])(
    'reads an owned %s photo selection into a safely named file',
    async (appId) => {
      const ownedUri = `content://${appId}.selectedmedia/12345678-abcd`;
      read.mockResolvedValue({ uri: ownedUri, mimeType: 'image/jpeg' });
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
      vi.stubGlobal('fetch', fetch);
      const signal = new AbortController().signal;
      const file = await readSharedWishImage('generation', signal);
      expect(fetch).toHaveBeenCalledWith(ownedUri, { signal });
      expect(file.name).toBe('shared-photo.jpg');
      expect(file.type).toBe('image/jpeg');
      expect(file.size).toBe(3);
    },
  );

  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
    ['IMAGE/JPEG; charset=binary', 'jpg'],
  ])('accepts %s', async (mimeType, extension) => {
    read.mockResolvedValue({ uri, mimeType });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))),
    );
    const file = await readSharedWishImage(
      'generation',
      new AbortController().signal,
    );
    expect(file.name).toBe(`shared-photo.${extension}`);
  });

  it.each([
    'content://other.app.selectedmedia/abcd',
    'content://de.eimir.app.selectedmedia/abcd?source=external',
    'content://de.eimir.app.selectedmedia/../abcd',
    'file:///data/user/0/de.eimir.app/photo.jpg',
  ])(
    'rejects the unowned or extended URI %s before reading bytes',
    async (bad) => {
      read.mockResolvedValue({ uri: bad, mimeType: 'image/jpeg' });
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await expect(
        readSharedWishImage('generation', new AbortController().signal),
      ).rejects.toThrow('Invalid photo selection');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    'video/mp4',
    'image/svg+xml',
    'image/gif',
    'application/octet-stream',
    'text/html',
  ])('rejects the media type %s before reading bytes', async (mimeType) => {
    read.mockResolvedValue({ uri, mimeType });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      readSharedWishImage('generation', new AbortController().signal),
    ).rejects.toThrow('Unsupported photo type');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an empty selection', async () => {
    read.mockResolvedValue({ uri, mimeType: 'image/png' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array())),
    );
    await expect(
      readSharedWishImage('generation', new AbortController().signal),
    ).rejects.toThrow();
  });

  it('stops reading when the photo exceeds the byte cap', async () => {
    read.mockResolvedValue({ uri, mimeType: 'image/png' });
    const chunk = new Uint8Array(SHARED_WISH_PHOTO_MAX_BYTES / 2 + 1);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(
      readSharedWishImage('generation', new AbortController().signal),
    ).rejects.toThrow('exceeds limit');
  });

  it('stops when the operation is aborted', async () => {
    read.mockResolvedValue({ uri, mimeType: 'image/png' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]))),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      readSharedWishImage('generation', controller.signal),
    ).rejects.toThrow('aborted');
  });
});
