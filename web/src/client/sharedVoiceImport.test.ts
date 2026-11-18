// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ read }),
  Capacitor: { convertFileSrc: (uri: string) => uri },
}));

import { readSharedVoice } from './sharedVoiceImport';

afterEach(() => vi.unstubAllGlobals());

it.each(['de.eimir.app', 'de.eimir.app.debug'])(
  'reads only owned %s voice selections',
  async (appId) => {
    const uri = `content://${appId}.selectedmedia/12345678-abcd`;
    read.mockResolvedValue({ uri, mimeType: 'audio/ogg' });
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const file = await readSharedVoice('generation', signal);
    expect(fetch).toHaveBeenCalledWith(uri, { signal });
    expect(file.type).toBe('audio/ogg');
    expect(file.size).toBe(3);
  },
);
it.each([
  'content://other.app.selectedmedia/abcd',
  'content://de.eimir.app.selectedmedia/abcd?source=external',
])(
  'rejects an unowned or extended voice URI before reading bytes',
  async (uri) => {
    read.mockResolvedValue({ uri, mimeType: 'audio/ogg' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      readSharedVoice('generation', new AbortController().signal),
    ).rejects.toThrow('Invalid voice selection');
    expect(fetch).not.toHaveBeenCalled();
  },
);
