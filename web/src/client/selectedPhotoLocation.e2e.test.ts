import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import { Configuration } from './apiConfiguration';
import {
  createMemoryWithReadyAttachments,
  uploadMemoryDraftAttachment,
} from './memoryAttachmentDraft';
import { createReferenceApis, signIn } from './referenceFlow';

const realTest = process.env.EIMIR_NATIVE_SELECTED_PHOTO ? test : test.skip;

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is required for native selected-photo acceptance.`,
    );
  return value;
}

describe('native selected photo through the real Web/server pipeline', () => {
  realTest(
    'creates a canonical shared Place from the actual Android File bytes',
    async () => {
      const apiBaseUrl = required('G2_E2E_API_BASE');
      const session = await signIn(
        apiBaseUrl,
        required('G2_E2E_EMAIL'),
        required('G2_E2E_PASSWORD'),
      );
      const accessToken = session.tokens.accessToken;
      const spaceId = required('G2_E2E_SPACE_ID');
      const apis = createReferenceApis(apiBaseUrl, accessToken);
      const places = new PlacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      // This file is captured after actual foreign-owned picker selection and
      // Chromium File.arrayBuffer(), not generated or replaced by this test.
      const file = new File(
        [new Uint8Array(readFileSync(required('EIMIR_NATIVE_SELECTED_PHOTO')))],
        'native-selected-photo.jpg',
        { type: 'image/jpeg' },
      );
      const phases: string[] = [];
      const ready = await uploadMemoryDraftAttachment(
        apis,
        apiBaseUrl,
        accessToken,
        spaceId,
        file,
        (phase) => phases.push(phase),
      );
      expect(phases).toEqual(['uploading', 'validating']);
      // Polling READY above requires the separately running production worker;
      // this acceptance never calls validate() or seeds a location draft/Place.
      const { memory } = await createMemoryWithReadyAttachments(
        apis,
        spaceId,
        {
          title: 'Android gallery location acceptance',
          body: 'Foreign camera photo → platform picker → File → upload → worker → shared save.',
          happenedOn: new Date('2026-10-27T00:00:00Z'),
        },
        [ready.attachmentId],
      );
      expect(memory.attachments.map((item) => item.id)).toEqual([
        ready.attachmentId,
      ]);
      const linked = await places.listMomentPlaces({
        spaceId,
        kind: 'memories',
        targetId: memory.id,
      });
      expect(linked.items).toHaveLength(1);
      const place = linked.items[0];
      expect(place.latitude).toBe(52.516667);
      expect(place.longitude).toBe(13.4);
      const canonical = await places.getPlace({ spaceId, placeId: place.id });
      expect(canonical).toMatchObject({
        id: place.id,
        latitude: 52.516667,
        longitude: 13.4,
      });
      const reread = await apis.memories.getMemory({
        spaceId,
        memoryId: memory.id,
      });
      expect(reread.attachments[0].id).toBe(ready.attachmentId);
    },
    120_000,
  );
});
