// @vitest-environment jsdom
import {
  creationOptionsFromJson,
  decodeBase64Url,
  encodeBase64Url,
  requestOptionsFromJson,
} from './webauthnCodec';

describe('WebAuthn JSON codec', () => {
  it('round-trips base64url without padding', () => {
    const bytes = new Uint8Array([251, 255, 190, 1, 2]);
    const encoded = encodeBase64Url(bytes.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(new Uint8Array(decodeBase64Url(encoded))).toEqual(bytes);
  });

  it('turns a registration challenge into creation options', () => {
    const options = creationOptionsFromJson({
      rp: { id: 'eimir.example', name: 'eimir.' },
      user: { id: 'AQID', name: 'mara', displayName: 'Mara' },
      challenge: 'BAUG',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [{ id: 'BwgJ', type: 'public-key' }],
      authenticatorSelection: { residentKey: 'required' },
    });
    expect(options.rp).toEqual({ id: 'eimir.example', name: 'eimir.' });
    expect(new Uint8Array(options.user.id as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(new Uint8Array(options.challenge as ArrayBuffer)).toEqual(
      new Uint8Array([4, 5, 6]),
    );
    expect(options.excludeCredentials).toHaveLength(1);
    expect(options.authenticatorSelection).toEqual({ residentKey: 'required' });
  });

  it('turns an authentication challenge into request options', () => {
    const options = requestOptionsFromJson({
      challenge: 'BAUG',
      rpId: 'eimir.example',
      userVerification: 'preferred',
    });
    expect(options.rpId).toBe('eimir.example');
    expect(options.allowCredentials).toBeUndefined();
    expect(options.userVerification).toBe('preferred');
  });
});
