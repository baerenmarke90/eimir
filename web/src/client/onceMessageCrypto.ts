import {
  GeneralEncrypt,
  exportJWK,
  generalDecrypt,
  generateKeyPair,
  importJWK,
  type GeneralJWE,
  type JWK,
} from 'jose';

export const ONCE_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
export const ONCE_TEXT_MAX_LENGTH = 4000;
const DATABASE = 'eimir-once-device-keys-v1';
const STORE = 'keys';
const AUDIO_TYPES = new Set([
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
]);

export interface OnceDeviceKey {
  scope: string;
  id: string;
  publicJwk: JWK;
  privateKey: CryptoKey;
}

export interface OnceMedia {
  kind: 'IMAGE' | 'AUDIO';
  mime: string;
  data: string;
  description: string;
  duration?: number;
}

export interface OnceContent {
  v: 1;
  spaceId: string;
  senderId: string;
  recipientId: string;
  requestId: string;
  text: string;
  media?: OnceMedia;
}

function openKeys(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'scope' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('deviceUnavailable'));
    request.onblocked = () => reject(new Error('deviceUnavailable'));
  });
}

export async function deviceKey(
  scope: string,
  create = false,
): Promise<OnceDeviceKey | undefined> {
  const db = await openKeys();
  try {
    const existing = await new Promise<OnceDeviceKey | undefined>(
      (resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(scope);
        request.onsuccess = () =>
          resolve(request.result as OnceDeviceKey | undefined);
        request.onerror = () => reject(new Error('deviceUnavailable'));
      },
    );
    if (existing || !create) return existing;
    const pair = await generateKeyPair('RSA-OAEP-256', {
      modulusLength: 3072,
      extractable: false,
    });
    const candidate: OnceDeviceKey = {
      scope,
      id: crypto.randomUUID(),
      publicJwk: await exportJWK(pair.publicKey),
      privateKey: pair.privateKey,
    };
    return await new Promise<OnceDeviceKey>((resolve, reject) => {
      // The second read and insertion share a transaction, including across tabs.
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      let selected = candidate;
      const read = store.get(scope);
      read.onsuccess = () => {
        if (read.result) selected = read.result as OnceDeviceKey;
        else store.add(candidate);
      };
      transaction.oncomplete = () => resolve(selected);
      transaction.onerror = () => reject(new Error('deviceUnavailable'));
      transaction.onabort = () => reject(new Error('deviceUnavailable'));
    });
  } finally {
    db.close();
  }
}

export async function removeDeviceKey(scope: string): Promise<void> {
  const db = await openKeys();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(scope);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('deviceUnavailable'));
    });
  } finally {
    db.close();
  }
}

export async function encryptOnce(
  content: OnceContent,
  recipients: readonly { id: string; publicJwk: object }[],
): Promise<GeneralJWE> {
  if (!recipients.length || recipients.length > 8)
    throw new Error('deviceUnavailable');
  validateContent(content);
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  try {
    const encryption = new GeneralEncrypt(bytes).setProtectedHeader({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
    });
    for (const recipient of recipients) {
      const key = await importJWK(recipient.publicJwk as JWK, 'RSA-OAEP-256');
      encryption.addRecipient(key).setUnprotectedHeader({ kid: recipient.id });
    }
    return await encryption.encrypt();
  } finally {
    bytes.fill(0);
  }
}

export async function decryptOnce(
  envelope: object,
  key: OnceDeviceKey,
  expected: Pick<
    OnceContent,
    'spaceId' | 'senderId' | 'recipientId' | 'requestId'
  >,
): Promise<OnceContent> {
  const { plaintext } = await generalDecrypt(
    envelope as GeneralJWE,
    key.privateKey,
    {
      keyManagementAlgorithms: ['RSA-OAEP-256'],
      contentEncryptionAlgorithms: ['A256GCM'],
    },
  );
  try {
    if (plaintext.byteLength > 6 * 1024 * 1024)
      throw new Error('invalidContent');
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    validateContent(parsed);
    for (const name of [
      'spaceId',
      'senderId',
      'recipientId',
      'requestId',
    ] as const) {
      if (parsed[name] !== expected[name]) throw new Error('invalidContent');
    }
    return parsed;
  } finally {
    plaintext.fill(0);
  }
}

function validateContent(value: unknown): asserts value is OnceContent {
  if (!value || typeof value !== 'object') throw new Error('invalidContent');
  const content = value as OnceContent;
  if (
    content.v !== 1 ||
    typeof content.text !== 'string' ||
    content.text.length > ONCE_TEXT_MAX_LENGTH ||
    !content.requestId ||
    !content.senderId ||
    !content.recipientId ||
    !content.spaceId
  )
    throw new Error('invalidContent');
  if (!content.media && !content.text.trim()) throw new Error('invalidContent');
  const media = content.media;
  if (!media) return;
  if (
    typeof media.data !== 'string' ||
    !media.data.length ||
    media.data.length > Math.ceil(ONCE_MEDIA_MAX_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(media.data) ||
    typeof media.description !== 'string' ||
    media.description.length > 300
  )
    throw new Error('invalidContent');
  if (media.kind === 'IMAGE' && media.mime === 'image/jpeg') return;
  if (
    media.kind === 'AUDIO' &&
    AUDIO_TYPES.has(media.mime) &&
    typeof media.duration === 'number' &&
    Number.isFinite(media.duration) &&
    media.duration > 0 &&
    media.duration <= 180
  )
    return;
  throw new Error('invalidContent');
}

export function base64Bytes(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}

export function onceMediaBlob(media: OnceMedia): Blob {
  const bytes = Uint8Array.from(atob(media.data), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length > ONCE_MEDIA_MAX_BYTES) throw new Error('invalidContent');
  return new Blob([bytes], { type: media.mime });
}

export async function prepareOncePhoto(file: File): Promise<Blob> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error('photoInvalid');
  const image = await createImageBitmap(file).catch(() => {
    throw new Error('photoInvalid');
  });
  try {
    if (image.width * image.height > 36_000_000)
      throw new Error('photoInvalid');
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('photoInvalid');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // A fresh canvas export strips embedded camera/location metadata.
    const result = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!result || result.size > ONCE_MEDIA_MAX_BYTES)
      throw new Error('mediaTooLarge');
    return result;
  } finally {
    image.close();
  }
}

export async function prepareOnceAudio(
  file: File,
): Promise<{ blob: Blob; duration: number }> {
  if (
    !AUDIO_TYPES.has(file.type) ||
    !file.size ||
    file.size > ONCE_MEDIA_MAX_BYTES
  )
    throw new Error('mediaTooLarge');
  const context = new AudioContext();
  try {
    const decoded = await context
      .decodeAudioData(await file.arrayBuffer())
      .catch(() => {
        throw new Error('audioInvalid');
      });
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration <= 0 ||
      decoded.duration > 180
    )
      throw new Error('audioInvalid');
    return { blob: file, duration: decoded.duration };
  } finally {
    await context.close();
  }
}
