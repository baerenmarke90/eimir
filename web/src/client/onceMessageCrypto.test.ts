import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  deviceKey,
  encryptOnce,
  decryptOnce,
  removeDeviceKey,
  type OnceContent,
} from './onceMessageCrypto';

function content(): OnceContent {
  return {
    v: 1,
    spaceId: 'space-a',
    senderId: 'sender',
    recipientId: 'recipient',
    requestId: crypto.randomUUID(),
    text: 'A private thought',
  };
}

describe('one-time encrypted envelope', () => {
  it('keeps a non-extractable private key on the receiving device and encrypts for its public key', async () => {
    const key = (await deviceKey('recipient-space-a', true))!;
    expect(key.privateKey.extractable).toBe(false);
    await expect(
      crypto.subtle.exportKey('jwk', key.privateKey),
    ).rejects.toThrow();
    expect((await deviceKey('recipient-space-a'))?.id).toBe(key.id);
    expect(await deviceKey('recipient-space-b')).toBeUndefined();
    const original = content();
    const jwe = await encryptOnce(original, [
      { id: key.id, publicJwk: key.publicJwk },
    ]);
    expect(JSON.stringify(jwe)).not.toContain(original.text);
    expect(await decryptOnce(jwe, key, original)).toEqual(original);
    await expect(
      decryptOnce(jwe, key, { ...original, recipientId: 'someone-else' }),
    ).rejects.toThrow('invalidContent');
    await removeDeviceKey('recipient-space-a');
    expect(await deviceKey('recipient-space-a')).toBeUndefined();
  });

  it('allows the same envelope on registered devices, rejecting unrelated keys and altered ciphertext', async () => {
    const keys = await Promise.all(
      ['device-one', 'device-two', 'unrelated'].map((scope) =>
        deviceKey(scope, true),
      ),
    );
    const original = content();
    const jwe = await encryptOnce(
      original,
      keys
        .slice(0, 2)
        .map((key) => ({ id: key!.id, publicJwk: key!.publicJwk })),
    );
    for (const key of keys.slice(0, 2))
      expect((await decryptOnce(jwe, key!, original)).text).toBe(original.text);
    await expect(decryptOnce(jwe, keys[2]!, original)).rejects.toThrow();
    const changed = {
      ...jwe,
      ciphertext:
        (jwe.ciphertext[0] === 'A' ? 'B' : 'A') + jwe.ciphertext.slice(1),
    };
    await expect(decryptOnce(changed, keys[0]!, original)).rejects.toThrow();
  });

  it('does not accept active-image formats, oversized text or invalid audio as message payload', async () => {
    const key = (await deviceKey('validation-device', true))!;
    const recipient = [{ id: key.id, publicJwk: key.publicJwk }];
    await expect(
      encryptOnce({ ...content(), text: 'a'.repeat(4001) }, recipient),
    ).rejects.toThrow('invalidContent');
    await expect(
      encryptOnce(
        {
          ...content(),
          media: {
            kind: 'IMAGE',
            mime: 'image/svg+xml',
            data: 'PHN2Zz4=',
            description: '',
          },
        },
        recipient,
      ),
    ).rejects.toThrow('invalidContent');
    await expect(
      encryptOnce(
        {
          ...content(),
          media: {
            kind: 'AUDIO',
            mime: 'audio/ogg',
            data: 'YWJj',
            description: '',
            duration: 181,
          },
        },
        recipient,
      ),
    ).rejects.toThrow('invalidContent');
  });
});
