import { APP_ROUTES, MORE_PRIVATE_ROUTE } from './routes';
import {
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
  createPrivateAreaApi,
  privateAreaQueryKeys,
} from './privateArea';

describe('EIMIR-M5-Web-S4-SCOPE', () => {
  it('keeps the owner-only area out of shared primary navigation', () => {
    // The area is reachable under More rather than as a primary destination,
    // so its existence is never advertised beside the shared areas.
    expect(
      APP_ROUTES.some((route) => route.path.startsWith(MORE_PRIVATE_ROUTE)),
    ).toBe(false);
    expect([
      PRIVATE_NOTES_PATH,
      PRIVATE_GIFT_IDEAS_PATH,
      PRIVATE_COLLECTIONS_PATH,
    ]).toEqual([
      '/more/private/notes',
      '/more/private/gift-ideas',
      '/more/private/collections',
    ]);
  });

  it('isolates query caches across account and space switches', () => {
    const accountA = privateAreaQueryKeys.root('account-a', 'space-a');
    const accountB = privateAreaQueryKeys.root('account-b', 'space-a');
    const spaceB = privateAreaQueryKeys.root('account-a', 'space-b');
    expect(accountA).not.toEqual(accountB);
    expect(accountA).not.toEqual(spaceB);
    expect(accountA).toEqual([
      'm5-s4-private',
      'account-a',
      'space-a',
      'owner',
      'account-a',
    ]);
  });

  it('uses only space-scoped generated list requests without a partner selector', async () => {
    const api = createPrivateAreaApi('https://eimir.invalid', 'token');
    const notes = await api.listPrivateNotesRequestOpts({
      spaceId: 'space-a',
      limit: 20,
    });
    const gifts = await api.listGiftIdeasRequestOpts({
      spaceId: 'space-a',
      limit: 20,
    });
    const collections = await api.listPrivateCollectionsRequestOpts({
      spaceId: 'space-a',
      limit: 20,
    });

    expect(notes.path).toBe('/api/v1/spaces/space-a/private/notes');
    expect(gifts.path).toBe('/api/v1/spaces/space-a/private/gift-ideas');
    expect(collections.path).toBe('/api/v1/spaces/space-a/private/collections');
    expect(notes.query).toEqual({ limit: 20 });
    expect(gifts.query).toEqual({ limit: 20 });
    expect(collections.query).toEqual({ limit: 20 });
  });
});
