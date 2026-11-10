import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import fixtures from '../fixtures/locales/de';
import { fulfillDefaultProductContext } from './productContext';
import {
  ACCOUNT_ID,
  CAPABILITIES,
  DETAIL_COMMENTS,
  installMocks,
  ME,
  SPACE_ID,
} from './storyTimelineFixture';

const base = `/api/v1/spaces/${SPACE_ID}`;
const stamp = '2026-11-10T12:00:00Z';
const photo = readFileSync(
  new URL(
    '../../../backend/demo_assets/images/lake-sunrise.jpg',
    import.meta.url,
  ),
);
const voice = readFileSync(
  new URL(
    '../../../backend/tests/fixtures/media/voice/short.m4a',
    import.meta.url,
  ),
);

export const pageComposerVoiceInput = new URL(
  '../../../backend/tests/fixtures/media/voice/short.ogg',
  import.meta.url,
).pathname;

export const pageComposerContent = fixtures.pageComposer;

export async function installPageComposerFixture(
  page: Page,
  {
    sensitivePhotos = true,
    linkedWish = false,
  }: { sensitivePhotos?: boolean; linkedWish?: boolean } = {},
) {
  await page.addInitScript(
    ({ accountId, spaceId }) => {
      localStorage.setItem('eimir.theme', 'system');
      localStorage.setItem(
        `eimir:product-tour:v1:${accountId}:${spaceId}`,
        'seen',
      );
    },
    { accountId: ACCOUNT_ID, spaceId: SPACE_ID },
  );
  const unexpected = await installMocks(page, { strict: true });
  const calls: {
    method: string;
    path: string;
    body: Record<string, unknown>;
  }[] = [];
  const shared = {
    spaceId: SPACE_ID,
    createdBy: ACCOUNT_ID,
    creator: ME,
    authorId: ACCOUNT_ID,
    author: ME,
    capabilities: CAPABILITIES,
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
  };
  const image = (id: string, position = 0, isSensitive = false) => ({
    ...shared,
    id,
    ownerId: ACCOUNT_ID,
    status: 'READY',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    originalName: `${id}.jpg`,
    size: photo.length,
    width: 1200,
    height: 800,
    hasThumbnail: true,
    isSensitive,
    position,
    reactions: [],
  });
  const photos = [
    image('composer-photo-1'),
    image('composer-photo-2', 1, sensitivePhotos),
  ];
  const audio = {
    ...image('composer-voice'),
    mediaType: 'AUDIO',
    mimeType: 'audio/mp4',
    originalName: 'short.m4a',
    size: voice.length,
    durationSeconds: 1,
    hasThumbnail: false,
    width: null,
    height: null,
    position: 2,
  };
  const attachments = new Map<string, Record<string, unknown>>(
    [...photos, audio].map((item) => [item.id, item]),
  );
  const place = {
    ...shared,
    id: 'composer-place',
    name: pageComposerContent.placeName,
    address: pageComposerContent.placeAddress,
    description: null,
    latitude: 49.56,
    longitude: 7.07,
  };
  const places: Array<Record<string, unknown>> = [place];
  const list = {
    ...shared,
    id: 'composer-list',
    title: pageComposerContent.listTitle,
    icon: 'checklist',
    items: pageComposerContent.listItems.map((title, position) => ({
      ...shared,
      id: `composer-list-item-${position}`,
      collectionId: 'composer-list',
      title,
      completed: position < 2,
      position,
    })),
  };
  const resources = new Map<string, Record<string, unknown>>([
    [
      'memories/mem-canal',
      {
        ...shared,
        id: 'mem-canal',
        title: pageComposerContent.memoryTitle,
        body: pageComposerContent.memoryBody,
        happenedOn: '2026-11-10',
        happenedUntil: null,
        tags: [pageComposerContent.tag],
        placeIds: [place.id],
        attachments: photos,
        selectedCoverAttachmentId: photos[0].id,
      },
    ],
    [
      'heart-moments/hm-love',
      {
        ...shared,
        id: 'hm-love',
        text: pageComposerContent.heartText,
        emotion: 'GRATEFUL',
        visibility: 'SHARED',
        happenedOn: '2026-11-10',
        tags: [pageComposerContent.tag],
        attachment: photos[0],
        attachments: [...photos, audio],
        selectedCoverAttachmentId: photos[0].id,
        location: null,
        audioTitle: null,
        audioSpeakerName: null,
      },
    ],
    [
      'plans/composer-plan',
      {
        ...shared,
        id: 'composer-plan',
        title: pageComposerContent.planTitle,
        description: pageComposerContent.planBody,
        status: 'PLANNED',
        plannedOn: null,
        plannedStart: '2026-11-21T11:00:00Z',
        plannedEnd: null,
        experiencedOn: null,
        sourceWishId: null,
        placeId: place.id,
        anticipationEnabled: false,
        tags: [pageComposerContent.tag],
        attachments: photos,
        coverAttachmentId: photos[0].id,
        selectedCoverAttachmentId: photos[0].id,
      },
    ],
  ]);
  let uploadNumber = 0;
  const links = new Map<string, Set<string>>();
  if (linkedWish) {
    resources.set('wishes/composer-wish', {
      ...shared,
      id: 'composer-wish',
      title: pageComposerContent.wishTitle,
      status: 'OPEN',
      description: null,
      tags: [],
      attachments: [],
      placeId: null,
    });
    links.set('memories/mem-canal/wishes', new Set(['composer-wish']));
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const key = path.slice(base.length + 1);
    const json = (body: unknown, status = 200) =>
      route.fulfill({ json: body, status });
    const body = () => request.postDataJSON() as Record<string, unknown>;
    const record = () => {
      const value = body();
      calls.push({ method, path, body: value });
      return value;
    };
    if (path === '/api/v1/auth/capabilities')
      return json({ serverAdmin: false, audioProcessingEnabled: true });
    if (path === `${base}/entitlements`)
      return json({
        spaceId: SPACE_ID,
        tier: 'PREMIUM',
        status: 'ACTIVE',
        capabilities: ['core', 'memories.map', 'integration.external_sync'],
        isInGracePeriod: false,
      });
    if (path === `${base}/dashboard/preferences`) return json({ items: [] });
    if (path === `${base}/photo-sources`)
      return json({
        enabled: true,
        googleAvailable: true,
        immichConnected: true,
        immichConnectionToken: 'fixture:immich:connected',
        immichOrigin: 'https://photos.example.test',
        canImport: true,
      });
    if (path === `${base}/memory-map`)
      return json({ items: [], nextCursor: null });
    const momentPlaces = key.match(
      /^moments\/(memories|heart-moments)\/([^/]+)\/places$/,
    );
    if (momentPlaces) {
      const moment = resources.get(`${momentPlaces[1]}/${momentPlaces[2]}`);
      return json({
        items:
          moment?.visibility === 'PRIVATE'
            ? []
            : places.filter(
                (item) =>
                  (moment?.placeIds as string[] | undefined)?.includes(
                    item.id as string,
                  ) ?? item.id === place.id,
              ),
        nextCursor: null,
        hasMore: false,
      });
    }
    if (path === `${base}/context-tag-suggestions`)
      return json({
        learned: [pageComposerContent.tag],
        proposed: pageComposerContent.suggestedTags,
      });
    if (path === `${base}/places`) {
      if (method === 'POST') {
        const created = {
          ...shared,
          ...record(),
          id: `composer-place-${places.length}`,
        };
        places.push(created);
        return json(created, 201);
      }
      return json({ items: places, nextCursor: null, hasMore: false });
    }
    const savedPlace = places.find(
      (item) => path === `${base}/places/${item.id}`,
    );
    if (savedPlace) return json(savedPlace);
    if (path === `${base}/collections`)
      return json({ items: [list], nextCursor: null, hasMore: false });
    if (path === `${base}/collections/${list.id}`) return json(list);
    if (path === `${base}/collections/${list.id}/items` && method === 'POST') {
      const created = {
        ...shared,
        ...record(),
        id: `composer-list-item-${list.items.length}`,
        collectionId: list.id,
        position: list.items.length,
        completed: false,
      };
      list.items.push(created as (typeof list.items)[number]);
      return json(created, 201);
    }
    const listItem = list.items.find(
      (item) => path === `${base}/collections/${list.id}/items/${item.id}`,
    );
    if (listItem && method === 'PATCH') {
      Object.assign(listItem, record(), { version: listItem.version + 1 });
      return json(listItem);
    }
    if (path === `${base}/attachments` && method === 'POST') {
      const values = record();
      const id = `composer-upload-${++uploadNumber}`;
      const item = {
        ...(values.mediaType === 'AUDIO' ? audio : image(id)),
        id,
        mediaType: values.mediaType,
        status: 'PENDING',
      };
      attachments.set(id, item);
      return json(
        {
          attachment: item,
          method: 'STREAM',
          uploadUrl: `${base}/attachments/${id}/content`,
          requiredHeaders: {},
        },
        201,
      );
    }
    const media = key.match(/^attachments\/([^/]+)(?:\/(.*))?$/);
    if (media) {
      const item = attachments.get(media[1]);
      if (!item) return json({ code: 'NOT_FOUND' }, 404);
      if (media[2] === 'content')
        return method === 'PUT'
          ? route.fulfill({ status: 204 })
          : route.fulfill({
              contentType:
                item.mediaType === 'AUDIO' ? 'audio/mp4' : 'image/jpeg',
              body: item.mediaType === 'AUDIO' ? voice : photo,
            });
      if (media[2] === 'read-access')
        return json({
          method: 'STREAM',
          mediaType: item.mediaType,
          url: `${base}/attachments/${media[1]}/content`,
          expiresAt: '2030-01-01T00:00:00Z',
        });
      if (media[2] === 'finalize') Object.assign(item, { status: 'READY' });
      return json(item);
    }
    const replaceAttachments = (
      resource: Record<string, unknown>,
      values: Record<string, unknown>,
    ) => {
      if (!Array.isArray(values.attachments)) return;
      resource.attachments = values.attachments.map((entry) => ({
        ...attachments.get(entry.attachmentId),
        position: entry.position,
        isSensitive: entry.isSensitive ?? false,
      }));
      if ('text' in resource)
        resource.attachment = (resource.attachments as unknown[])[0] ?? null;
    };
    const resource = resources.get(key);
    if (resource) {
      if (method === 'PATCH') {
        const values = record();
        Object.assign(resource, values, {
          version: Number(resource.version) + 1,
        });
        replaceAttachments(resource, values);
      }
      return json(resource);
    }
    const extension = key.match(
      /^(memories\/[^/]+|heart-moments\/[^/]+|plans\/[^/]+)\/(.*)$/,
    );
    const parent = extension && resources.get(extension[1]);
    if (parent && extension) {
      const suffix = extension[2];
      if (suffix === 'places')
        return json({
          items:
            parent.visibility === 'PRIVATE'
              ? []
              : places.filter(
                  (item) =>
                    (parent.placeIds as string[] | undefined)?.includes(
                      item.id as string,
                    ) ?? item.id === place.id,
                ),
          nextCursor: null,
          hasMore: false,
        });
      if (suffix === 'comments')
        return json({
          items: parent.visibility === 'PRIVATE' ? [] : DETAIL_COMMENTS,
          nextCursor: null,
          hasMore: false,
        });
      if (suffix === 'story')
        return json({ items: [], nextCursor: null, hasMore: false });
      if (suffix === 'collections') return json([list]);
      if (suffix.startsWith('collections/'))
        return route.fulfill({ status: 204 });
      if (suffix === 'attachments' && method === 'PUT') {
        const values = record();
        replaceAttachments(parent, values);
        Object.assign(parent, {
          selectedCoverAttachmentId: values.selectedCoverAttachmentId,
          version: Number(parent.version) + 1,
        });
        return json(parent);
      }
      if (suffix === 'visibility' && method === 'PATCH') {
        Object.assign(parent, record(), {
          version: Number(parent.version) + 1,
        });
        return json(parent);
      }
      const reaction = suffix.match(/^attachments\/([^/]+)\/reaction$/);
      if (
        reaction &&
        method === 'PUT' &&
        extension[1].startsWith('memories/')
      ) {
        const value = record().reaction;
        const item = (
          parent.attachments as Array<Record<string, unknown>>
        ).find((entry) => entry.id === reaction[1]);
        if (item)
          item.reactions = value
            ? [{ reaction: value, count: 1, own: true }]
            : [];
        return json(parent);
      }
      const relation = suffix.match(/^(plans|wishes)(?:\/([^/]+))?$/);
      if (relation) {
        const relationKey = `${extension[1]}/${relation[1]}`;
        const ids = links.get(relationKey) ?? new Set<string>();
        links.set(relationKey, ids);
        if (method === 'GET') return json({ items: [...ids] });
        if (method === 'PUT') ids.add(relation[2]);
        else if (method === 'DELETE') ids.delete(relation[2]);
        return route.fulfill({ status: 204 });
      }
    }
    if (['memories', 'heart-moments', 'plans', 'wishes'].includes(key)) {
      if (method === 'POST') {
        const values = record();
        const id = `composer-created-${key}`;
        const created = {
          ...shared,
          id,
          tags: [],
          attachments: [],
          placeIds: [],
          ...values,
          ...(key === 'plans'
            ? {
                status:
                  values.plannedOn || values.plannedStart ? 'PLANNED' : 'IDEA',
                sourceWishId: null,
                experiencedOn: null,
              }
            : {}),
        };
        replaceAttachments(created, values);
        resources.set(`${key}/${id}`, created);
        return json(created, 201);
      }
      return json({
        items: [...resources]
          .filter(([path]) => path.startsWith(`${key}/`))
          .map(([, value]) => value),
        nextCursor: null,
        hasMore: false,
      });
    }
    if (await fulfillDefaultProductContext(route)) return;
    return route.fallback();
  });
  return { unexpected, calls, resources, list, places };
}
