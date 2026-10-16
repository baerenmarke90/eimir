import { describe, expect, test } from 'vitest';

import {
  createReferenceApis,
  runMemoryMediaStoryFlow,
  signIn,
} from './referenceFlow';

const e2eTest = import.meta.env.VITE_G2_E2E_ENABLED === '1' ? test : test.skip;

function requiredEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value)
    throw new Error(`${String(name)} must be set for the G2 E2E run.`);
  return value;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

const PNG_FIXTURE =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUs4liYGBgYmBgYGBgAAAIXgC4cKsbrQAAAABJRU5ErkJggg==';

describe('G2 real Web client E2E', () => {
  e2eTest(
    'runs Memory -> image -> timeline -> authorized read against the real stack',
    async () => {
      const apiBaseUrl = requiredEnv('VITE_G2_E2E_API_BASE');
      const email = requiredEnv('VITE_G2_E2E_EMAIL');
      const password = requiredEnv('VITE_G2_E2E_PASSWORD');
      const spaceId = requiredEnv('VITE_G2_E2E_SPACE_ID');

      const session = await signIn(apiBaseUrl, email, password);
      const accessToken = session.tokens.accessToken;
      const apis = createReferenceApis(apiBaseUrl, accessToken);
      const file = new File([decodeBase64(PNG_FIXTURE)], 'g2-web.png', {
        type: 'image/png',
      });

      let downloadedBlob: Blob | undefined;
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = (blob: Blob): string => {
        downloadedBlob = blob;
        return 'blob:g2-web-e2e';
      };

      try {
        const result = await runMemoryMediaStoryFlow(
          apis,
          apiBaseUrl,
          accessToken,
          spaceId,
          {
            title: 'G2 Web E2E',
            body: 'Real client -> HTTP -> API -> PostgreSQL -> MediaStore -> Story.',
          },
          file,
        );

        expect(result.memory.title).toBe('G2 Web E2E');
        expect(result.memory.attachments).toHaveLength(1);

        const storyMemory = result.story.items.find(
          (item) =>
            item.kind === 'MEMORY' && item.memory.id === result.memory.id,
        );
        expect(storyMemory).toBeDefined();
        expect(storyMemory?.kind).toBe('MEMORY');

        expect(result.imageUrl).toBe('blob:g2-web-e2e');
        expect(downloadedBlob).toBeDefined();
        if (!downloadedBlob) throw new Error('Expected downloaded blob');
        const downloaded = new Uint8Array(await downloadedBlob.arrayBuffer());
        expect(Array.from(downloaded.slice(0, 8))).toEqual([
          137, 80, 78, 71, 13, 10, 26, 10,
        ]);
      } finally {
        URL.createObjectURL = originalCreateObjectURL;
      }
    },
  );
});
